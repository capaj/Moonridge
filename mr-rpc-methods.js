var _ = require('lodash');
var Promise = require('bluebird');
var eventNames = ['create', 'preupdate', 'update', 'remove'];
var queryBuilder = require('./query-builder');
var populateWithClientQuery = require('./utils/populate-doc-util');
var maxLQsPerClient = 100;
var debug = require('debug')('moonridge:server');
var getUser = require('./authentication').getUser;

/**
 *
 * @param {Model} model Moonridge model
 * @param {Schema} schema mongoose schema
 * @param {Object} opts same as for regNewModel in ./main.js
 */
var expose = function(model, schema, opts) {

	var liveQueries = {};
	var modelName = model.modelName;
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
			var userPL = getUser(socket).privilige_level;

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

	var getIndexInSorted = require('./utils/indexInSortedArray');

	schema.on('CUD', function(evName, mDoc) {   // will be called by schema's event firing
		var doc = mDoc.toObject();
		Object.keys(liveQueries).forEach(function(LQString) {
			var LQ = liveQueries[LQString];

			var syncLogic = function() {
				var cQindex = LQ.getIndexById(doc._id); //index of current doc in the query

				if (evName === 'remove' && LQ.docs[cQindex]) {

					LQ.docs.splice(cQindex, 1);
					LQ._distributeChange(doc, evName, cQindex);

					if (LQ.indexedByMethods.limit) {
						var skip = 0;
						if (LQ.indexedByMethods.skip) {
							skip = LQ.indexedByMethods.skip[0];
						}
						skip += LQ.indexedByMethods.limit[0] - 1;
						model.find(LQ.mQuery).lean().skip(skip).limit(1)
							.exec(function(err, docArr) {
								if (err) {
									throw err;
								}
								if (docArr.length === 1) {
									var toFillIn = docArr[0];   //first and only document
									if (toFillIn) {
										LQ.docs.push(toFillIn);
										LQ._distributeChange(toFillIn, 'add', cQindex);
									}
								}

							}
						);

					} else if (LQ.indexedByMethods.findOne) {
						LQ.mQuery.exec(function(err, doc) {
							if (err) {
								throw err;
							}
							if (doc) {
								LQ.docs.push(doc);
								LQ._distributeChange(doc, 'add', cQindex);
							}

						});
					}

				} else {
					var checkQuery = model.findOne(LQ.mQuery);
					debug('After ' + evName + ' checking ' + doc._id + ' in a query ' + LQString);
					if (!LQ.indexedByMethods.findOne) {
						checkQuery = checkQuery.where('_id').equals(doc._id).select('_id');
					}
					checkQuery.exec(function(err, checkedDoc) {
							if (err) {
								throw err;
							}
							if (checkedDoc) {   //doc satisfies the query

								if (LQ.indexedByMethods.populate.length !== 0) {    //needs to populate before send
									doc = mDoc;
								}
								if (LQ.indexedByMethods.findOne) {
									LQ.docs[0] = checkedDoc;
									return LQ._distributeChange(checkedDoc, 'add', 0);
								}
								if (LQ.indexedByMethods.sort) {
									var sortBy = LQ.indexedByMethods.sort[0].split(' ');	//check for string is performed on query initialization
									var index;
									if (evName === 'create') {
										evName = 'add';
										if (cQindex === -1) {
											index = getIndexInSorted(doc, LQ.docs, sortBy);
											LQ.docs.splice(index, 0, doc);
											if (LQ.indexedByMethods.limit) {
												if (LQ.docs.length > LQ.indexedByMethods.limit[0]) {
													LQ.docs.splice(LQ.docs.length - 1, 1);

												}
											}

										}
									}
									if (evName === 'update') {
										index = getIndexInSorted(doc, LQ.docs, sortBy);

										if (cQindex === -1) {
											LQ.docs.splice(index, 0, doc);    //insert the document
										} else {
											if (cQindex !== index) {
												if (cQindex < index) {  // if we remove item before, the whole array shifts, so we have to compensate index by 1.
													LQ.docs.splice(cQindex, 1);
													LQ.docs.splice(index - 1, 0, doc);
												} else {
													LQ.docs.splice(cQindex, 1);
													LQ.docs.splice(index, 0, doc);
												}

											} else {
												LQ.docs[index] = doc;
											}
										}

									}
									LQ._distributeChange(doc, evName, index);
								} else {
									if (evName === 'create') {
										if (cQindex === -1) {
											LQ.docs.push(doc);
											LQ._distributeChange(doc, 'add', cQindex);
										}
									}
									if (evName === 'update') {
										if (cQindex === -1) {
											var newIndex = LQ.docs.push(doc);
											LQ._distributeChange(doc, evName, newIndex);	//doc wasn't in the result, but after update is
										}
									}

								}
							} else {
								debug('Checked doc ' + doc._id + ' in a query ' + LQString + ' was not found');
								if (evName === 'update' && cQindex !== -1) {
									LQ.docs.splice(cQindex, 1);
									LQ._distributeChange(doc, evName, cQindex);		//doc was in the result, but after update is no longer
								}
							}
						}
					);
				}
			};
			if (LQ.firstExecDone) {
				syncLogic();
			} else {
				LQ.firstExecPromise.then(syncLogic);
			}

		});

	});

	var notifySubscriber = function(clientPubMethod) {
		return function(doc, evName) {   // will be called by schema's event firing
			clientPubMethod(doc, evName);
		}

	};

	function unsubscribe(id, event) {  //accepts same args as findFn
		var res = model.off(id, event);
		if (res) {
			delete this.mrEventIds[event];
		}
		return res;
	}

	/**
	 * @param {Socket} socket
	 */
	function unsubscribeAll(socket) {
		var soc = socket || this;
		var mrEventIds = soc.mrEventIds;
		for (var eN in mrEventIds) {
			unsubscribe.call(soc, mrEventIds[eN], eN);
		}
	}

	function subscribe(evName) {
		if (evName) {
			var socket = this;
			if (!socket.mrEventIds) {
				socket.mrEventIds = {};

				socket.on('disconnect', function() {
					unsubscribeAll(socket);
				});
			}
			var existing = this.mrEventIds;
			if (existing && existing[evName]) {
				// event already subscribed, we don't want to support more than 1 remote listener so we unregister the old one
				unsubscribe(existing[evName], evName);
			}

			var clFns = socket.cRpcChnl;

			var evId = model.on(evName, notifySubscriber(clFns.pub, socket));

			socket.mrEventIds[evName] = evId;

			return evId;
		} else {
			throw new Error('event must be specified when subscribing to it');
		}

	}

	function subscribeAll(query) {
		var evIds = {};
		var socket = this;
		eventNames.forEach(function(name) {
			evIds[name] = subscribe.call(socket, name, query);
		});
		return evIds;
	}

	if (!opts.checkPermission) {
		/**
		 *
		 * @param {String} op operation to check, can be 'C','R', 'U', 'D'
		 * @param socket
		 * @param {Document} [doc]
		 * @returns {bool} true when user has permission, false when not
		 */
		opts.checkPermission = function(socket, op, doc) {
			var PL = 0; //privilige level
			var user = getUser(socket);

			if (user) {
				PL = user.privilige_level;
			}

			if (doc && op !== 'C') {   //if not creation, with creation only priviliges apply
				if (doc.owner && doc.owner.toString() === user.id) {
					return true;    // owner does not need any permissions
				}
				if (doc.id === user.id) {
					return true;    //user modifying himself also has permissions
				}
			}

			if (this.permissions && this.permissions[op]) {
				if (PL < this.permissions[op]) {
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

	/**
	 * @param {String} qKey
	 * @param {Mongoose.Query} mQuery
	 * @param {Object} queryMethodsHandledByMoonridge are query methods which are important for branching in the LQ
	 *                  syncing logic, we need their arguments accessible on separated object to be able to run
	 *                  liveQuerying effectively
	 * @returns {Object}
	 * @constructor
	 */
	function LiveQuery(qKey, mQuery, queryMethodsHandledByMoonridge) {
		this.docs = [];
		this.listeners = {};
		this.mQuery = mQuery;   //mongoose query

		this.qKey = qKey;
		this.indexedByMethods = queryMethodsHandledByMoonridge; //serializable client query object
		return this;
	}

	LiveQuery.prototype = {
		destroy: function() {
			delete liveQueries[this.qKey];
		},
		/**
		 *
		 * @param {Document.Id} id
		 * @returns {Number} -1 when not found
		 */
		getIndexById: function(id) {
			id = id.id;
			var i = this.docs.length;
			while (i--) {
				var doc = this.docs[i];
				if (doc && doc._id.id === id) {
					return i;
				}
			}
			return i;
		},
		/**
		 *
		 * @param {Object|Mongoose.Document} doc
		 * @param {String} evName
		 * @param {Number} resultIndex number, indicates an index where the doc should be inserted, -1 for a document which
		 *                 is no longer in the result of the query
		 */
		_distributeChange: function(doc, evName, resultIndex) {
			var self = this;
			var actuallySend = function() {
				for (var socketId in self.listeners) {
					var listener = self.listeners[socketId];
					var toSend = null;
					if (listener.qOpts.count) {
						// we don't need to send a doc when query is a count query
					} else {
						if (evName === 'remove') {
							toSend = doc._id.toString();	//remove needs only _id, which should be always defined
						} else {
							toSend = opts.dataTransform(doc, 'R', listener.socket);
						}
					}

					debug('calling doc %s event %s, pos param %s', doc._id, evName, resultIndex);

					listener.socket.rpc('MR.' + modelName + '.' + evName)(listener.clIndex, toSend, resultIndex);
				}
			};

			if (typeof doc.populate === 'function') {
				populateWithClientQuery(doc, this.indexedByMethods.populate, function(err, populated) {
					if (err) {
						throw err;
					}
					doc = populated.toObject();
					actuallySend();
				});
			} else {
				actuallySend();
			}


		},
		/**
		 * removes a socket listener from liveQuery and also destroys the whole liveQuery if no more listeners are present
		 * @param socket
		 */
		removeListener: function(socket) {
			if (this.listeners[socket.id]) {
				delete this.listeners[socket.id];
				if (Object.keys(this.listeners).length === 0) {
					this.destroy(); // this will delete a liveQuery from liveQueries
				}
			} else {
				return new Error('no listener present on LQ ' + this.qKey);
			}
		}
	};


	var channel = {
		/**
		 * for running normal DB queries
		 * @param {Object} clientQuery
		 * @returns {Promise} from executing the mongoose.Query
		 */
		query: function(clientQuery) {
			if (!opts.checkPermission(this, 'R')) {
				return new Error('You lack a privilege to read this document');
			}
			accessControlQueryModifier(clientQuery, schema, getUser(this).privilige_level, 'R');

			var queryAndOpts = queryBuilder(model, clientQuery);

			return queryAndOpts.mQuery.exec();
		},
		//unsubscribe
		unsub: unsubscribe,
		unsubAll: unsubscribeAll,
		unsubLQ: function(index) {	//when client uses stop method on LQ, this method gets called
			var LQ = this.registeredLQs[index];
			if (LQ) {
				delete this.registeredLQs[index];
				LQ.removeListener(this);
				return true;
			} else {
				return new Error('Index param in LQ unsubscribe is not valid!');
			}
		},
		/**
		 * @param {Object} clientQuery object to be parsed by queryBuilder, consult mongoose query.js docs for reference
		 * @param {Number} LQIndex
		 * @returns {Promise} from mongoose query, resolves with an array of documents
		 */
		liveQuery: function(clientQuery, LQIndex) {
			if (!opts.checkPermission(this, 'R')) {
				return new Error('You lack a privilege to read this collection');
			}
			def = Promise.defer();
			if (!clientQuery.count) {
				accessControlQueryModifier(clientQuery, schema, getUser(this).privilige_level, 'R');
			}

			var builtQuery = queryBuilder(model, clientQuery);

			var queryOptions = builtQuery.opts;
			var mQuery = builtQuery.mQuery;

			if (!mQuery.exec) {
				return new Error('query builder has returned invalid query');
			}
			var socket = this;

			var qKey = JSON.stringify(clientQuery);
			var LQ = liveQueries[qKey];
			var def;

			var pushListeners = function(LQOpts) {

				var activeClientQueryIndexes = Object.keys(socket.registeredLQs);

				if (activeClientQueryIndexes.length > maxLQsPerClient) {
					def.reject(new Error('Limit for queries per client reached. Try stopping some live queries.'));
					return;
				}

				var resolveFn = function() {
					var retVal;
					if (LQOpts.hasOwnProperty('count')) {
						retVal = {count: LQ.docs.length, index: LQIndex};
					} else {
						retVal = {docs: LQ.docs, index: LQIndex};
					}

					def.resolve(retVal);

					LQ.listeners[socket.id] = {socket: socket, clIndex: LQIndex, qOpts: LQOpts};
				};

				if (LQ.firstExecDone) {
					resolveFn();
				} else {
					LQ.firstExecPromise.then(resolveFn);
				}
			};
			if (LQ) {
				pushListeners(queryOptions);
			} else {
				LQ = new LiveQuery(qKey, mQuery, queryOptions);
				liveQueries[qKey] = LQ;

				pushListeners(queryOptions);

				LQ.firstExecPromise = mQuery.exec().then(function(rDocs) {
					LQ.firstExecDone = true;

					if (mQuery.op === 'findOne') {
						if (rDocs) {
							LQ.docs = [rDocs];  //rDocs is actually just one document
						} else {
							LQ.docs = [];
						}
					} else {
						var i = rDocs.length;
						while (i--) {
							LQ.docs[i] = rDocs[i];
						}
					}

					return rDocs;

				}, function(err) {
					debug("First LiveQuery exec failed with err " + err);
					def.reject(err);
					LQ.destroy();
				});

			}

			if (!socket.registeredLQs[LQIndex]) { //query can be reexecuted when user authenticates, then we already have
				socket.registeredLQs[LQIndex] = LQ;
			}
			return def.promise;
		},
		//TODO have a method to stop and resume liveQuery
		//subscribe
		sub: subscribe,
		subAll: subscribeAll,
		/**
		 * @returns {Array<String>} of the model's properties
		 */
		listPaths: function() {
			return Object.keys(schema.paths);
		}
	};

	if (opts.readOnly !== true) {
		_.extend(channel, {
			/**
			 * @param {Object} newDoc
			 * @returns {Promise}
			 */
			create: function(newDoc) {
				if (!opts.checkPermission(this, 'C')) {
					return new Error('You lack a privilege to create this document');
				}
				opts.dataTransform(newDoc, 'W', this);
				if (schema.paths.owner) {
					//we should set the owner field if it is present
					newDoc.owner = getUser(this)._id;
				}
				return model.create(newDoc);

			},
			/**
			 * deletes a document by it's id
			 * @param {String} id
			 * @returns {Promise}
			 */
			remove: function(id) {

				var def = Promise.defer();
				var socket = this;
				model.findById(id, function(err, doc) {
					if (err) {
						return def.reject(err);
					}
					if (doc) {
						if (opts.checkPermission(socket, 'D', doc)) {
							doc.remove(function(err) {
								if (err) {
									def.reject(err);
								}
								def.resolve();
							});
						} else {
							def.reject(new Error('You lack a privilege to delete this document'));
						}
					} else {
						def.reject(new Error('no document to remove found with _id: ' + id));
					}
				});
				return def.promise;
			},
			/**
			 * finds a document by _id and then updates it
			 * @param toUpdate
			 * @returns {Promise}
			 */
			update: function(toUpdate) {

				var def = Promise.defer();
				var socket = this;
				var id = toUpdate._id;
				delete toUpdate._id;

				model.findById(id, function(err, doc) {
					if (err) {
						return def.reject(err);
					}
					if (doc) {
						if (opts.checkPermission(socket, 'U', doc)) {
							opts.dataTransform(toUpdate, 'W', socket);
							var previousVersion = doc.toObject();
							if (toUpdate.__v !== doc.__v) {
								def.reject(new Error('Document version mismatch-your copy is version ' + toUpdate.__v + ', but server has ' + doc.__v));
							} else {
								delete toUpdate.__v; //save a bit of unnecesary work when we are extending doc on the next line
							}
							_.extend(doc, toUpdate);
							doc.__v += 1;
							schema.emit('preupdate', doc, previousVersion);

							doc.save(function(err) {
								if (err) {
									def.reject(err);
								}
								def.resolve();	//we don't resolve with new document because when you want to display
								// current version of document, just use liveQuery
							});
						} else {
							def.reject(new Error('You lack a privilege to update this document'));
						}

					} else {
						def.reject(new Error('no document to update found with _id: ' + id));
					}
				});
				return def.promise;
			}
		});
	}

	return function exposeCallback(rpcInstance) {
		var toExpose = {MR: {}};
		toExpose.MR[modelName] = channel;
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

		return {modelName: modelName, queries: liveQueries}; // returning for health check
	};

};

module.exports = expose;


