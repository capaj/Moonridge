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

    model.onAll(function (doc, evName) {   // will be called by schema's event firing
        Object.keys(liveQueries).forEach(function (LQString) {
            var LQ = liveQueries[LQString];
            var cQindex = LQ.getIndexById(doc._id); //index of current doc in the query

            if (evName === 'remove' && LQ.docs[cQindex]) {
                LQ.callListeners(doc, evName, false);

                LQ.docs.splice(cQindex, 1);
                if (LQ.options) {
                    var cPaginatedQindex = LQ.getIndexByIdInPaginated(doc._id); //index of current doc in the query
                    if (cPaginatedQindex) {
                        LQ.docsPaginated.splice(cPaginatedQindex, 1);

                    } else {
                        var limit;
                        var fillDocIndex;
                        if (LQ.options.limit) {
                            limit = LQ.options.limit;
                            fillDocIndex = LQ.options.skip + limit;
                            if (cQindex <= fillDocIndex) {
                                var toFillIn = LQ.docs[fillDocIndex - 1];   //TODO check if this index is correct
                                if (toFillIn) {
                                    LQ.docsPaginated.push(toFillIn);
                                    LQ.callListeners(toFillIn, 'push');
                                }
                            }
                        }

                    }
                }

            } else {
                model.findOne(LQ.query).where('_id').equals(doc._id).select('_id')
                    .exec(function(err, id) {
                        if (!err && id) {
                            if (evName === 'create') {
                                LQ.docs.push(doc);  //TODO solve sorting here
                            }
                            if (evName === 'update') {
                                if (cQindex === -1) {
                                    LQ.docs.push(doc);  //TODO solve sorting here
                                }
                            }
                            LQ.callListeners(doc, evName, true);

                        } else {
                            if (evName === 'update' && cQindex !== -1) {
                                LQ.docs.splice(cQindex, 1);
                                LQ.callListeners(doc, evName, false);
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

    /**
     *
     * @param qKey
     * @param mQuery
     * @param queryOptions
     * @returns {Object}
     * @constructor
     */
    function LiveQuery(qKey, mQuery, queryOptions) {
        var self = this;
        this.docs = [];
        this.listeners = [];
        this.query = mQuery;
        this.qKey = qKey;
        this.options = queryOptions;
        return this;
    }

    LiveQuery.prototype =  {
        destroy: function () {
            delete liveQueries[this.qKey];
        },
        getIndexById: function (id) {
            id = id.id;
            var i = this.docs.length;
            while(i--)
            {
                var doc = this.docs[i];
                if (doc._id.id === id) {
                    return i;
                }
            }
            return undefined;
        },
        getIndexByIdInPaginated: function (id) {
            id = id.id;
            var i = this.docsPaginated.length;
            while(i--)
            {
                var doc = this.docsPaginated[i];
                if (doc._id.id === id) {
                    return i;
                }
            }
            return undefined;
        },
        getDocsPaginated: function () {
            var docsPaginated;
            if (this.options.skip) {
                docsPaginated = this.docs.splice(this.options.skip);
            }
            if (this.options.limit) {
                if (docsPaginated) {
                    docsPaginated = docsPaginated.splice(0, this.options.limit);
                } else {
                    docsPaginated = this.docs.splice(0, this.options.limit);
                }
            }
            return docsPaginated || this.docs;
        },
        /**
         * creates new query for just for determining whether
         * @param {Document}
         * @returns {Query}
         */
        createMatchQuery: function (doc) {
            return model.findOne(self.query).where('_id').equals(doc._id);
        },
        /**
         *
         * @param doc
         * @param {String} evName
         * @param isInResult
         */
        callListeners: function (doc, evName, isInResult) {
            var i = this.listeners.length;
            if (evName === 'remove') {
                doc = doc._id.toString();	//remove needs only _id
            }
            while(i--) {
                var listener = self.listeners[i];
                var uP = listener.socket.manager.user.privilige_level;
                doc = deleteUnpermittedProps(doc, 'R', uP);
                listener.method(doc, evName, listener.clIndex, isInResult);
            }
        },
        removeListener: function (socket) {
            var li = self.listeners.length;
            while(li--) {
                if (self.listeners[li].socket === socket) {
                    self.listeners.splice(li, 1);
                    if (self.listeners.length === 0) {
                        self.destroy();
                    }
                    break;	// listener should be registered only once, so no need to continue loop
                }
            }
        }
    };

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

            accesControlQueryModifier(clientQuery, schema, this.manager.user.privilige_level, 'R');
			clientQuery.lean = true; // this should make query always lean

            var queryOptions = {};
            if (clientQuery.skip) {
                queryOptions.skip = clientQuery.skip;
                delete clientQuery.skip;
            }
            if (clientQuery.limit) {
                queryOptions.limit = clientQuery.limit;
                delete clientQuery.skip;
            }

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

                    var docs = LQ.getDocsPaginated();
                    if (this.options) {
                        LQ.docsPaginated = docs;
                    }
                    var retVal = {docs: docs, index: clIndex};

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
                        LQ = new LiveQuery(qKey, mQuery, queryOptions);
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


