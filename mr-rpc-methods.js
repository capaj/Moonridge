var rpc = require('socket.io-rpc');
var _ = require('lodash');
var when = require('when');
var eventNames = require('./schema-events').eventNames;
var queryBuilder = require('./query-builder');

/**
 *
 * @param {Model} model
 * @param {Schema} schema mongoose schema
 * @param {Object} opts
 */
var expose = function (model, schema, opts) {
	var liveQueries = {};
	opts = opts || {};
	var modelName = model.modelName;
	var queryValidation = function (callback) {
		callback(true);
	};

    /**
     * similar purpose as accesControlQueryModifier but works not on query, but objects, usable whenever we are sending
     * new doc to client without querying
     * @param {Object} doc just JS object, not a real mongoose doc
     * @param {String} op operation, 'R' or 'W'
     * @param {Number} userPL privilige level of the current user
     * @returns {*}
     */
    function deleteUnpermittedProps(doc, op, userPL) {
        var pathPs = schema.pathPermissions;
        var doc = _.clone(doc);

        for (var prop in pathPs) {
            var perm = pathPs[prop];
            if (perm[op] && perm[op] > userPL) {
                delete doc[prop];
            }
        }
        return doc;
    }
	/**
	 * DO NOT OVERRIDE, moonridge won't work if you do
	 * @param next
	 * @param doc
	 */
	schema.onPrecreate = function (next, doc) {
		Object.keys(liveQueries).forEach(function (LQString) {
			var LQ = liveQueries[LQString];
			LQ.docs.push(doc);
			// liveQuery
			// if LQ.docs.length > limit
			//TODO call query with limit 1 and skip LQ.query.skip + LQ.query.limit + 1 to get an item, which should be remove from

			LQ.callListeners('create', true);
			next();
		});

	};

	/**
	 * DO NOT OVERRIDE, moonridge won't work if you do
	 * @param next
	 * @param doc
	 */
	schema.onPreremove = function (next, doc) {
		Object.keys(liveQueries).forEach(function (LQString) {
			var LQ = liveQueries[LQString];
			var cQindex = LQ.getIndexById(doc._id); //index of current doc in the query
			var begin = LQ.query.options.skip;		// cursor area begin

			function fillTheLastDocumentToMatchTheLimit() {
				if (LQ.query.options.limit === LQ.docs.length + 1) {
					var endSkip = begin + LQ.query.options.limit;
					LQ.createMatchQuery().limit(1).skip(endSkip).exec().then(function (arr) {

						if (arr.length === 1) {
							LQ.docs.push(arr[0]);	//push a document so that live query still matches the limit after removing first doc
							var doc = arr[0];
							var i = LQ.listeners.length;

							while(i--) {
								var listener = LQ.listeners[i];
								var uP = listener.socket.manager.user.privilige_level;
								doc = deleteUnpermittedProps(doc, 'R', uP);
								listener.method(doc, 'push', listener.clIndex, true);
							}

						}
						next();

					});
				}
			}

			if (LQ.docs[cQindex]) {
				LQ.callListeners('remove', false);
				LQ.docs.splice(cQindex, 1);
				fillTheLastDocumentToMatchTheLimit();
			} else {
				//most complicated case, we have to check the if the doc is before the cursor area
				if (LQ.query.options.skip == 0) {
					//there is nothing before cursor area, which means the removed item is after it
					//in this case we don't have to do anything

				} else {

					var isBeforeLQArea = LQ.createMatchQuery().limit(begin).skip(0).select('_id');
					isBeforeLQArea.exec().then(function (arr) {
						if (arr.length === 1) {	//removed doc found before the beginning of cursor area
							LQ.docs.splice(0, 1);   // remove first
							fillTheLastDocumentToMatchTheLimit();
							var i = LQ.listeners.length;

							while(i--) {
								var listener = LQ.listeners[i];
								listener.method(doc, 'remove_first', listener.clIndex, true);
							}
						}
						next();

					})
				}

			}
		});

	};

	model.on('update', function (doc, evName) {   // will be called by schema's event firing
		Object.keys(liveQueries).forEach(function (LQString) {
			var LQ = liveQueries[LQString];
			var cQindex = LQ.getIndexById(doc._id); //index of current doc in the query

			LQ.createMatchQuery().select('_id')
				.exec(function(err, id) {
					if (!err && id) {
						if (evName === 'update') {
							if (cQindex === -1) {
								LQ.docs.push(doc);
							}
							LQ.callListeners(evName, true);
						}
					} else {
						if (evName === 'update' && cQindex !== -1) {
							LQ.docs.splice(cQindex, 1);
							LQ.callListeners(evName, false);
						}
					}
				}
			);

		});

	});

	var notifySubscriber = function (clientPubMethod) {
		return function (doc, evName) {   // will be called by schema's event firing
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

                socket.on('disconnect', function () {
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
        eventNames.forEach(function (name) {
            evIds[name] = subscribe.call(socket, name, query);
        });
        return evIds;
    }

    /**
     *
     * @param {String} op operation to check
     * @returns {bool} true when user has permission, false when not
     * @param socketContext
     */
	opts.checkPermission = function (socketContext, op) {
		var PL = socketContext.manager.user.privilige_level;

		if (this.permissions && this.permissions[op]) {
			if (PL < this.permissions[op]) {
				return false;
			}
		}
		return true;
	};

    /**
     *  This function should always modify the query so that no one sees properties that they are not allowed to see
     * @param {Object} clQuery object parsed from stringified argument
     * @param {Schema} schema mongoose schema
     * @param {Number} userPL user privilege level
     * @param {String} op
     * @returns {Object}
     */
    function accesControlQueryModifier(clQuery, schema, userPL, op) { // gives us
        var pathPs = schema.pathPermissions;

        var select = clQuery.select || {};
        if (_.isString(select)) {
            //in this case, we need to parse the string and return the object notation
            var props = select.split(' ');
            var i = props.length;
            while(i--){
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

        clQuery.select = select; //after modifying the query, we just
        return clQuery;
    }

	var channel = {
		/**
		 *
		 * @param clientQuery
		 * @returns {Promise}
		 */
		find: function (clientQuery) {
            accesControlQueryModifier(clientQuery,schema, this.manager.user.privilige_level, 'R');
            clientQuery.lean = true; // this should make query always lean
			var mQuery = queryBuilder(model, clientQuery);
            return mQuery.exec();
        },
		//unsubscribe
		unsub: unsubscribe,
		unsubAll: unsubscribeAll,
        unsubLQ: function (index) {
            var LQ = this.registeredLQs[index];
            this.registeredLQs.splice(index, 1);
            if (LQ) {
                LQ.removeListener(this);
                return true;
            } else {
                return false;
            }
        },
        /**
         *
         * @param {Object} clientQuery object to be parsed by queryBuilder, consult mongoose query.js docs for reference
         * @returns {Promise} from mongoose query, resolves with an array of documents
         */
        liveQuery: function (clientQuery) {
			if (!opts.checkPermission(this, 'R')) {
				return new Error('You lack a privilege to read this document');
			}
            def = when.defer();

            accesControlQueryModifier(clientQuery,schema, this.manager.user.privilige_level, 'R');
			clientQuery.lean = true; // this should make query always lean
            var mQuery = queryBuilder(model, clientQuery);
			if (!mQuery.exec) {
				return new Error('query builder has returned invalid query');
			}
			var socket = this;

            var qKey = JSON.stringify(clientQuery);
			var LQ = liveQueries[qKey];
            var def;

            var pushListeners = function () {
            	socket.clientChannelPromise.then(function (clFns) {
                    if (socket.registeredLQs.indexOf(LQ) !== -1) {
                        console.warn('live query ' + qKey + ' already registered' );	//already listening for that query
                    }
                    var clIndex = socket.registeredLQs.push(LQ) - 1;
                    LQ.listeners.push({rpcChannel: clFns, socket: socket, clIndex: clIndex});
                    var retVal = {docs: LQ.docs, index: clIndex};
                    def.resolve(retVal);

                }, function (err) {
                    def.reject(err);
                });

            };
            if (LQ) {
                pushListeners();	// no need for a promise, if we have it in memory
            } else {

				mQuery.exec().then(function (rDocs) {
                    if (!liveQueries[qKey]) {
                        LQ = {
                            docs: [], listeners: [], query: mQuery,
                            destroy: function () {
                                delete liveQueries[qKey];
                            },
                            getIndexById: function (id) {
                                id = id.id;
                                var i = LQ.docs.length;
                                while(i--)
                                {
                                    var doc = LQ.docs[i];
                                    if (doc._id.id === id) {
                                        return i;
                                    }
                                }
                                return undefined;
                            },
							/**
							 * creates new query for just for determining whether
							 * @param {Document}
							 * @returns {Query}
							 */
							createMatchQuery: function (doc) {
								return model.findOne(LQ.query).where('_id').equals(doc._id);
							},
							/**
							 *
							 * @param isInResult
							 * @param {String|Document} secondaryDoc doc to remove/add to LQ collection, used for create/remove with skip and limit query params set
							 * @param evName
							 */
							callListeners: function (isInResult, evName, secondaryDoc) {
								var i = LQ.listeners.length;
								if (evName === 'remove') {
									doc = doc._id.toString();	//remove needs only _id
								}
								while(i--) {
									var listener = LQ.listeners[i];
									var uP = listener.socket.manager.user.privilige_level;
									doc = deleteUnpermittedProps(doc, 'R', uP);
									listener.method(doc, evName, listener.clIndex, isInResult);
								}
							},
                            removeListener: function (socket) {
                                var li = LQ.listeners.length;
                                while(li--) {
                                    if (LQ.listeners[li].socket === socket) {
                                        LQ.listeners.splice(li, 1);
                                        if (LQ.listeners.length === 0) {
                                            LQ.destroy();
                                        }
                                        break;	// listener should be registered only once, so no need to continue loop
                                    }
                                }
                            }
                        };
                        liveQueries[qKey] = LQ;
                    }

                    var i = rDocs.length;
                    while(i--)
                    {
                        liveQueries[qKey].docs[i] = rDocs[i];
                    }

                    pushListeners();

                });
			}
            return def.promise;
        },
		//TODO have a method to stop and resume liveQuery
		//subscribe
		sub: subscribe,
		subAll: subscribeAll,
		populate: model.populate
	};

	if (opts && opts.readOnly !== true) {
		_.extend(channel, {
			create: function (newDoc) {
				if (!opts.checkPermission(this, 'C')) {
					return new Error('You lack a privilege to create this document');
				}
                deleteUnpermittedProps(newDoc, 'W', this.manager.user.privilige_level);
				return model.create(newDoc);

			},
			remove: function (id) {
				if (!opts.checkPermission(this, 'D')) {
					return new Error('You lack a privilege to delete this document');
				}
				var def = when.defer();
				model.findById(id, function (err, doc) {
					if (doc) {
						doc.remove(function (err) {
							if (err) {
								def.reject(err);
							}
							def.resolve();
						});
					} else {
						def.reject(new Error('no document with _id: ' + id));
					}
				});
				return def.promise;
			},
			update: function (toUpdate) {
				if (!opts.checkPermission(this, 'U')) {
					return new Error('You lack a privilege to update this document');
				}
                var uPL = this.manager.user.privilige_level;
				var def = when.defer();

				var id = toUpdate._id;
				delete toUpdate._id;
				model.findById(id, function (err, doc) {
					if (doc) {
                        deleteUnpermittedProps(toUpdate, 'W', uPL);

                        _.extend(doc, toUpdate);
						doc.save(function (err) {
							if (err) {
								def.reject(err);
							}
							def.resolve();
						});
					}
				});
				return def.promise;
			}
		});
	}
    var authFn = opts && opts.authFn;
    var exposeCallback = function () {
        var chnlSockets = rpc.expose('MR-' + modelName, channel, authFn);
        chnlSockets.on('connection', function (socket) {

            socket.clientChannelPromise = rpc.loadClientChannel(socket, 'MR-' + modelName).then(function (clFns) {
                socket.cRpcChnl = clFns;	// client RPC channel
                return clFns;
            });
            socket.registeredLQs = [];
            socket.on('disconnect', function() {
                //clearing out liveQueries listeners
                var index = socket.registeredLQs.length;
                while(index--) {
                    var LQ = socket.registeredLQs[index];
                    LQ.removeListener(socket);
                }
            });
        });
    };
    return exposeCallback;

};

module.exports = expose;


