var rpc = require('socket.io-rpc');
var _ = require('lodash');
var when = require('when');
var eventNames = require('./schema-events').eventNames;
var stringifyQuery = require('./mquery-stringify');

/**
 *
 * @param {Model} model
 * @param {Schema} schema mongoose schema
 * @param {Object} opts
 */
var expose = function (model, schema, opts) {
	var liveQueries = {};

	model.onAll(function (doc, evName) {   // will be called by schema's event firing
		Object.keys(liveQueries).forEach(function (LQString) {
			var LQ = liveQueries[LQString];
			var currQueried = LQ.docs;
			var cQindex = currQueried.indexOf(doc);

			var callListeners = function (isInResult) {
				var i = LQ.listeners.length;
				while(i--) {
					var listener = LQ.listeners[i];
                    listener.method(doc, evName, listener.clIndex, isInResult);
				}
			};
			if (evName === 'remove' && cQindex !== -1) {

				callListeners(false);
				currQueried.splice(cQindex, 1);

			} else {
				model.findOne(LQ.query).where('_id').equals(doc._id).select('_id')
					.exec(function(err, id) {
						if (!err && id) {
							if (evName === 'create') {
								currQueried.push(doc);
								callListeners(true);
							}
							if (evName === 'update') {
								if (cQindex === -1) {
									currQueried.push(doc);
								}
								callListeners(true);
							}
						} else {
							if (evName === 'update' && cQindex !== -1) {
								currQueried.splice(cQindex, 1);
								callListeners(false);
							}
						}
					}
				);
			}
		});

	});

	var notifySubscriber = function (clientPubMethod) {
		return function (doc, evName) {   // will be called by schema's event firing
			clientPubMethod(doc, evName);
		}

    };

    var modelName = model.modelName;

    function prepareQuery(qBase, limit, skip, populate) {

        var query;
        if (populate) {
            query = model.find(qBase).populate(populate).limit(limit).skip(skip);
        } else {
            query = model.find(qBase).limit(limit).skip(skip);
        }
        return query;
    }

    function prepareFindQuery(qBase, limit, skip, populate, lean) {
        if (lean === undefined) {
            lean = false;
        }
        var query = prepareQuery(qBase, limit, skip, populate);

        return query.lean(lean);
    }

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

	var channel = {
		find: function (qBase, limit, skip, populate, lean) {
            var q = prepareFindQuery.apply(model, arguments);
            return q.exec();
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
         * @param {Object} qBase object to be used as a param for find() method
         * @param {Number} limit
         * @param {Number} skip
         * @param {Boolean} populate
         * @returns {Promise} from mongoose query, resolves with an array of documents
         */
        liveQuery: function (qBase, limit, skip, populate) {
            arguments[4] = true; // this should make query always lean
            var query = prepareFindQuery.apply(model, arguments);
			var socket = this;

            subscribeAll.call(this, query);
            var qKey = stringifyQuery(query);
			var LQ = liveQueries[qKey];
            var def = when.defer();
            var pushListeners = function () {
            	var clFns = socket.cRpcChnl;
				if (socket.registeredLQs.indexOf(LQ) !== -1) {
					console.warn('live query ' + qKey + ' already registered' );	//already listening for that query
				}
				var clIndex = socket.registeredLQs.push(LQ) - 1;
				LQ.listeners.push({method: clFns.pub, socket: socket, clIndex: clIndex});
				def.resolve({docs: LQ.docs, index: clIndex});

            };
            if (LQ) {
                pushListeners();
			} else {
                query.exec().then(function (rDocs) {
                    if (!liveQueries[qKey]) {
                        LQ = {
                            docs: [], listeners: [], query: query,
                            destroy: function () {
                                delete liveQueries[qKey];
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
		//TODO have a method to stop liveQuery
		//subscribe
		sub: subscribe,
		subAll: subscribeAll,
		populate: model.populate
	};

	if (opts && opts.readOnly !== true) {
		_.extend(channel, {
			create: function (newDoc) {
				return model.create(newDoc);
//				var def = when.defer();
//				var lang = new model(newDoc);
//				lang.save(function (err, savedDoc) {
//					if (err) {
//						console.error("Document " + newDoc.toJSON() + " failed to save, error: " + err);
//						def.reject(err);
//					} else {
//						console.log("Following document was succesfully saved:" + savedDoc);
//						def.resolve(savedDoc);
//					}
//				});
//				return def.promise;
			},
			remove: function (id) {
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
				var def = when.defer();

				var id = toUpdate._id;
				delete toUpdate._id;
				model.findById(id, function (err, doc) {
					if (doc) {
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
    var chnlSockets = rpc.expose('MR-' + modelName, channel, authFn);
	chnlSockets.on('connection', function (socket) {
		rpc.loadClientChannel(socket, 'MR-' + modelName).then(function (clFns) {
			socket.cRpcChnl = clFns;	// client RPC channel
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

module.exports = expose;


