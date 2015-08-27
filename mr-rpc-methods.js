var _ = require('lodash');
var eventNames = ['create', 'preupdate', 'update', 'remove'];
var queryBuilder = require('./query-builder');
var LiveQuery = require('./utils/live-query');
var maxLQsPerClient = 100;
var debug = require('debug')('moonridge:server');
var liveQueriesStore = require('./utils/live-queries-store');
var objectResolvePath = require('./utils/object-resolve-path');
/**
 *
 * @param {Model} model Moonridge model
 * @param {Schema} schema mongoose schema
 * @param {Object} opts same as for regNewModel in ./main.js
 */
var expose = function(model, schema, opts) {
	var liveQueries;
	var modelName = model.modelName;
	liveQueriesStore[modelName] = liveQueries = {};

	debug('expose model ', modelName);
	if (opts.dataTransform) {
		debug('dataTransform method is overridden for model "%s"', modelName);
	} else {
		/**
		 * similar purpose as accessControlQueryModifier but works not on query, but objects, used whenever we are sending
		 * new doc to client without querying
		 * @param {Object} doc just JS object, not a real mongoose doc
		 * @param {String} op operation that is about to happen, possible values are: 'R', 'W'
		 * @param {Socket} socket
		 * @returns {*}
		 */
		opts.dataTransform = function deleteUnpermittedProps(doc, op, socket) {
			var userPL = socket.moonridge.user.privilege_level;

			var pathPs = schema.pathPermissions;
			var docClone = _.clone(doc);

			for (var prop in pathPs) {
				var perm = pathPs[prop];
				if (perm[op] && perm[op] > userPL) {
					if (docClone.hasOwnProperty(prop)) {
						delete docClone[prop];
					}
				}
			}
			return docClone;
		}
	}

	var modelSync = function(evName) {   // will be called by schema's event firing
		return function(mDoc) {
			Object.keys(liveQueries).forEach(function(LQString) {

				setImmediate(function(){	//we want to break out of promise error catching
					liveQueries[LQString].sync({evName: evName, mongooseDoc: mDoc, model: model});
				});

			});
		};
  };

	['create',
		'update',
		'remove'
	].forEach(function (evName){
			schema.on(evName, modelSync(evName));
	});

	if (!opts.checkPermission) {
		/**
		 * default checkPermission handler
		 * @param {String} op operation to check, can be 'C','R', 'U', 'D'
		 * @param socket
		 * @param {Document} [doc]
		 * @param {Document} [doc]
		 * @returns {Boolean} true when user has permission, false when not
		 */
		opts.checkPermission = function(socket, op, doc) {
			var user = socket.moonridge.user;
			var PL = user.privilege_level;

			if (doc && op !== 'C') {   //if not creation, with creation only privileges apply
				if (doc.owner && doc.owner.toString() === user.id) {
					return true;    // owner does not need any permissions
				}
				if (doc.id === user.id) {
					return true;    //user modifying himself also has permissions
				}
			}

			if (this.permissions && this.permissions[op]) {
				if (PL < this.permissions[op]) { //if bigger than connected user's
					return false;
				}
			}
			return true;
		};
	} else {
		debug('checkPermission method is overridden for model "%s"', modelName);
	}


	/**
	 *  This function should always modify the query so that no one sees properties that they are not allowed to see,
	 *  the query is modified right on the input and not somewhere later because then we get less variation and therefore less queries created
	 *  and checked on the server
	 * @param {Object} clQuery object parsed from stringified argument
	 * @param {Schema} schema mongoose schema
	 * @param {Number} userPL user privilege level
	 * @param {String} op
	 * @returns {Object}
	 */
	function accessControlQueryModifier(clQuery, schema, userPL, op) { // guards the properties that are marked with higher required permissions for reading
		var pathPs = schema.pathPermissions;
		var select;
		if (clQuery.select) {
			select = clQuery.select[0];
		} else {
			select = {};
		}
		if (_.isString(select)) {
			//in this case, we need to parse the string and return the object notation
			var props = select.split(' ');
			var i = props.length;
			while (i--) {
				var clProp = props[i];
				if (clProp[0] === '-') {
					clProp = clProp.substr(1);
					select[clProp] = 0;
				} else {
					select[clProp] = 1;
				}
			}
		}
		for (var prop in pathPs) {
			var perm = pathPs[prop];
			if (perm[op] && perm[op] > userPL) {
				select[prop] = 0;
			}
		}

		clQuery.select = [select]; //after modifying the query, we just put it back as array so that we can call it with apply
		return clQuery;
	}

	var mrMethods = {
		/**
		 * for running normal DB queries
		 * @param {Object} clientQuery
		 * @returns {Promise} from executing the mongoose.Query
		 */
		query: function(clientQuery) {
			if (!opts.checkPermission(this, 'R')) {
				throw new Error('You lack a privilege to read this document');
			}
			accessControlQueryModifier(clientQuery, schema, this.moonridge.privilege_level, 'R');
			//debug('clientQuery', clientQuery);
			var queryAndOpts = queryBuilder(model, clientQuery);

			return queryAndOpts.mQuery.exec();
		},

		unsubLQ: function(index) {	//when client uses stop method on LQ, this method gets called
			var LQ = this.registeredLQs[index];
			if (LQ) {
				delete this.registeredLQs[index];
				LQ.removeListener(this);
			} else {
				throw new Error('Index param in LQ unsubscribe is not valid!');
			}
		},
		/**
		 * @param {Object} clientQuery object to be parsed by queryBuilder, consult mongoose query.js docs for reference
		 * @param {Number} LQIndex
		 * @returns {Promise} from mongoose query, resolves with an array of documents
		 */
		liveQuery: function(clientQuery, LQIndex) {
			if (!opts.checkPermission(this, 'R')) {
				throw new Error('You lack a privilege to read this collection');
			}

			if (!clientQuery.count) {
				accessControlQueryModifier(clientQuery, schema, this.moonridge.privilege_level, 'R');
			}

			var builtQuery = queryBuilder(model, clientQuery);

			var queryOptions = builtQuery.opts;
			var mQuery = builtQuery.mQuery;

			if (!mQuery.exec) {
				throw new Error('query builder has returned invalid query');
			}
			var socket = this;

			var qKey = JSON.stringify(clientQuery);
			var LQ = liveQueries[qKey];

			return new Promise(function(resolve, reject) {
				var pushListeners = function(LQOpts) {

					var activeClientQueryIndexes = Object.keys(socket.registeredLQs);

					if (activeClientQueryIndexes.length > maxLQsPerClient) {
						reject(new Error('Limit for queries per client reached. Try stopping some live queries.'));
						return;
					}

					var resolveFn = function() {
						var retVal = {index: LQIndex};

						if (LQOpts.hasOwnProperty('count')) {
							retVal.count = LQ.docs.length;
						} else if (mQuery.op === 'distinct') {
							retVal.values = LQ.values;
						} else {
							retVal.docs = LQ.docs;
						}

						resolve(retVal);

						LQ.listeners[socket.id] = {socket: socket, clIndex: LQIndex, qOpts: LQOpts};
					};

					LQ.firstExecPromise.then(resolveFn);
				};
				if (LQ) {
					pushListeners(queryOptions);
				} else {
					LQ = new LiveQuery(qKey, mQuery, queryOptions, model);

					var onRejectionOfFirstQuery = function(err) {
						debug("First LiveQuery exec failed with err " + err);
						reject(err);
						LQ.destroy();
					};
					LQ.firstExecPromise = mQuery.exec().then(function(rDocs) {

						debug('mQuery.op', mQuery.op);
						if (mQuery.op === 'findOne') {
							if (rDocs) {
								LQ.docs = [rDocs];  //rDocs is actually just one document
							} else {
								LQ.docs = [];
							}
						} else if (mQuery.op === 'distinct') {
							LQ.values = rDocs;
						} else {
							var i = rDocs.length;
							while (i--) {
								LQ.docs[i] = rDocs[i];
							}
						}

						return rDocs;

					}, onRejectionOfFirstQuery);

					pushListeners(queryOptions);

				}

				if (!socket.registeredLQs[LQIndex]) { //query can be reexecuted when user authenticates, then we already have
					socket.registeredLQs[LQIndex] = LQ;
				}
			});

		},

		/**
		 * @returns {Array<String>} of the model's properties
		 */
		listPaths: function() {
			return Object.keys(schema.paths);
		}
	};

	if (opts.readOnly !== true) {
		_.extend(mrMethods, {
			/**
			 * @param {Object} newDoc
			 * @returns {Promise}
			 */
			create: function(newDoc) {
				if (!opts.checkPermission(this, 'C')) {
					throw new Error('You lack a privilege to create this document');
				}
				opts.dataTransform(newDoc, 'W', this);
				if (schema.paths.owner) {
					//we should set the owner field if it is present
					newDoc.owner = this.moonridge.user._id;
				}
				return model.create(newDoc);

			},
			/**
			 * deletes a document by it's id
			 * @param {String} id
			 * @returns {Promise}
			 */
			remove: function(id) {

				var socket = this;
				return new Promise(function(resolve, reject) {
					model.findById(id, function(err, doc) {
						if (err) {
							return reject(err);
						}
						if (doc) {
							if (opts.checkPermission(socket, 'D', doc)) {
								doc.remove(function(err) {
									if (err) {
										reject(err);
									}
									debug('removed a doc _id ', id);
									resolve();
								});
							} else {
								reject(new Error('You lack a privilege to delete this document'));
							}
						} else {
							reject(new Error('no document to remove found with _id: ' + id));
						}
					});
				});

			},
			/**
			 * finds a document by _id and then saves it
			 * @param {Object} toUpdate a document which will be saved, must have an existing _id
			 * @returns {Promise}
			 */
			update: function(toUpdate) {
				var socket = this;
				return new Promise(function(resolve, reject) {
					var id = toUpdate._id;
					delete toUpdate._id;

					model.findById(id, function(err, doc) {
						if (err) {
							debug('rejecting an update because: ', err);
							return reject(err);
						}
						if (doc) {
							if (opts.checkPermission(socket, 'U', doc)) {
								opts.dataTransform(toUpdate, 'W', socket);
								var previousVersion = doc.toObject();
								if (toUpdate.__v !== doc.__v) {
									reject(new Error('Document version mismatch-your copy is version ' + toUpdate.__v + ', but server has ' + doc.__v));
								} else {
									delete toUpdate.__v; //save a bit of unnecessary work when we are extending doc on the next line
								}
								_.merge(doc, toUpdate);
								doc.increment();
								schema.emit('preupdate', doc, previousVersion);

								doc.save(function(err) {
									if (err) {
										debug('rejecting a save because: ', err);
										reject(err);
									} else {
										debug('document ', id, ' saved, version now ', doc.__v);
										resolve();	//we don't resolve with new document because when you want to display
										// current version of document, just use liveQuery
									}
								});
							} else {
								reject(new Error('You lack a privilege to update this document'));
							}

						} else {
							reject(new Error('no document to save found with _id: ' + id));
						}
					});
				});

			},
			/**
			 * finds one document with a supplied query and then pushes item into it's array on a path
			 * @param {Object} query
			 * @param {String} path
			 * @param {*} item
			 * @returns {Promise} is resolved with a length of the array when item is pushed, is rejected when path is not found or item
			 */
			addToSet: function(query, path, item) {
				var socket = this;
				return new Promise(function(resolve, reject) {
					model.findOne(query, function(err, doc) {
						if (err) {
							debug('rejecting an update because: ', err);
							return reject(err);
						}
						if (doc) {
							if (opts.checkPermission(socket, 'U', doc)) {
								var previousVersion = doc.toObject();

								var set = objectResolvePath(doc, path);
								if (Array.isArray(set)) {
									if (set.indexOf(item) === -1) {
										set.push(item);
									} else {
										return resolve(set.length);
									}
								} else {
									return reject(new TypeError("Document ", doc._id, " hasn't an array on path ", path));
								}
								doc.increment();
								schema.emit('preupdate', doc, previousVersion);

								doc.save(function(err) {
									if (err) {
										debug('rejecting a save because: ', err);
										reject(err);
									} else {
										console.log('set.length', set.length);
										debug('document ', doc._id, ' saved, version now ', doc.__v);
										resolve(set.length);	//we don't resolve with new document because when you want to display
										// current version of document, just use liveQuery
									}
								});
							} else {
								reject(new Error('You lack a privilege to update this document'));
							}

						} else {
							reject(new Error('no document to update found with _id: ' + id));
						}
					});
				});

			},
			/**
			 * finds one document with a supplied query and then pushes an item into it's array on a path
			 * @param {Object} query
			 * @param {String} path
			 * @param {*} item it is highly recommended to use simple values, not objects
			 * @returns {Promise} is resolved with a length of the array when item is pushed, is rejected when path is not found or item
			 */
			removeFromSet: function(query, path, item) {
				var socket = this;
				return new Promise(function(resolve, reject) {
					model.findOne(query, function(err, doc) {
						if (err) {
							debug('rejecting an update because: ', err);
							return reject(err);
						}
						if (doc) {
							if (opts.checkPermission(socket, 'U', doc)) {
								var previousVersion = doc.toObject();

								var set = objectResolvePath(doc, path);
								if (Array.isArray(set)) {
									var itemIndex = set.indexOf(item);	//this would be always -1 for objects
                  if (itemIndex !== -1) {
										set.splice(itemIndex, 1);
									} else {
										return resolve(set.length);
									}
								} else {
									return reject(new TypeError("Document ", doc._id, " hasn't an array on path ", path));
								}
								doc.increment();
								schema.emit('preupdate', doc, previousVersion);

								doc.save(function(err) {
									if (err) {
										debug('rejecting a save because: ', err);
										reject(err);
									} else {
										debug('document ', doc._id, ' saved, version now ', doc.__v);
										resolve(set.length);	//we don't resolve with new document because when you want to display
										// current version of document, just use liveQuery
									}
								});
							} else {
								reject(new Error('You lack a privilege to update this document'));
							}

						} else {
							reject(new Error('no document to update found with _id: ' + id));
						}
					});
				});

			}
		});

		model.moonridgeOpts = opts;
	}

	return function exposeCallback(rpcInstance) {
		var toExpose = {MR: {}};
		toExpose.MR[modelName] = mrMethods;
		rpcInstance.expose(toExpose);

		rpcInstance.io.on('connection', function(socket) {
			socket.registeredLQs = [];
			socket.on('disconnect', function() {
				//clearing out liveQueries listeners
				for (var LQId in socket.registeredLQs) {
					var LQ = socket.registeredLQs[LQId];
					LQ.removeListener(socket);
				}
			});
		});

		debug('Model %s was exposed ', modelName);

		return _.assign(mrMethods, {modelName: modelName, queries: liveQueries}); // returning for health check
	};

};

module.exports = expose;


