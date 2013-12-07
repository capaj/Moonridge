var rpc = require('socket.io-rpc');
var _ = require('lodash');
var when = require('when');
var eventNames = require('./schema-events').eventNames;
var queryBuilder = require('./query-builder');

/**
 *
 * @param {Model} model Moonridge model
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

	var getIndexInSorted = require('./utils/indexInSortedArray');

    model.onCUD(function (mDoc, evName) {   // will be called by schema's event firing
        var doc = mDoc.toObject();
        Object.keys(liveQueries).forEach(function (LQString) {
            var LQ = liveQueries[LQString];
            var cQindex = LQ.getIndexById(doc._id); //index of current doc in the query

            if (evName === 'remove' && LQ.docs[cQindex]) {

                LQ.docs.splice(cQindex, 1);
				LQ.callClientListeners(doc, evName, false);

				if (LQ.docsPaginated) {

					var limit = LQ.options.limit || 0;
					var skip = LQ.options.skip || 0;
					var paginatedEnd = skip + limit;
					if (cQindex <= paginatedEnd) {
						var cPaginatedQindex = LQ.getIndexByIdInPaginated(doc._id); //index of current doc in the paginated query result
						if (cPaginatedQindex) {
							LQ.docsPaginated.splice(cPaginatedQindex, 1);
						} else {
							// removed document is before paginated area, so whole view shifts by one
							LQ.docsPaginated.splice(0, 1);
						}
						var toFillIn = LQ.docs[paginatedEnd - 1];   //TODO check if this index is correct
						if (toFillIn) {
							LQ.docsPaginated.push(toFillIn);
							LQ.callClientListeners(toFillIn, 'push');
						}
					}

                }

            } else {
                model.findOne(LQ.query).where('_id').equals(doc._id).select('_id')
                    .exec(function(err, id) {
						if (err) {
							console.error(err);
						}
						if (id) {
							if (LQ.clientQuery.sort) {
								var sortBy = LQ.clientQuery.sort.split(' ');	//check for string is performed on query initialization
								var index;
								if (evName === 'create') {
									index = getIndexInSorted(doc, LQ.docs, sortBy);
                                    LQ.docs.splice(index, 0, doc);
									if (LQ.docs.length > LQ.options.limit) {
										LQ.docs.splice(LQ.docs.length - 1, 1);

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
								if (_.isNumber(index)) {
									LQ.callClientListeners(doc, evName, index);
								}

							} else {
								if (evName === 'create') {
									LQ.docs.push(doc);
								}
								if (evName === 'update') {
									if (cQindex === -1) {
										LQ.docs.push(doc);
									}
								}
								LQ.callClientListeners(doc, evName, true);

							}
                        } else {
                            if (evName === 'update' && cQindex !== -1) {
                                LQ.docs.splice(cQindex, 1);
                                LQ.callClientListeners(doc, evName, false);
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
     * @param socketContext
     * @param {Document} [doc]
     * @returns {bool} true when user has permission, false when not
     */
	opts.checkPermission = function (socketContext, op, doc) {
		//privilige level
        var PL = socketContext.manager.user.privilige_level;
        if (doc && doc.owner && doc.owner === socketContext.manager.user._id) {
            return true;    // owner does not need any permissions
        }
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

        var select = clQuery.select || {};  //overriding clQuery select field to adhere to permissions
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
	 * @param qKey
	 * @param mQuery
	 * @param queryOptions
	 * @param {Object} clientQuery
	 * @returns {Object}
	 * @constructor
	 */
    function LiveQuery(qKey, mQuery, queryOptions, clientQuery) {
        this.docs = [];
        this.listeners = [];
        this.query = mQuery;
        this.qKey = qKey;
        this.clientQuery = clientQuery;
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
		/**
		 *
		 * @returns {boolean} true when paginated array is shorter than the whole array
		 */
		calculatePaginatedDocs: function () {
			var paginatedArray = _.clone(this.docs);
            if (this.options.skip) {
                paginatedArray = paginatedArray.splice(this.options.skip);
            }
            if (this.options.limit) {
				 paginatedArray = paginatedArray.splice(0, this.options.limit);
            }
			if (paginatedArray.length < this.docs.length) {
				this.docsPaginated = paginatedArray;
				return true;
			} else {
				return false;
			}
        },
        /**
         * creates new query for just for determining whether
         * @param {Document} doc
         * @returns {Query}
         */
        createMatchQuery: function (doc) {
            return model.findOne(self.query).where('_id').equals(doc._id);
        },
        /**
         *
         * @param doc
         * @param {String} evName
         * @param {Boolean|Number} isInResult when number, indicates an index where the doc should be inserted
         */
        callClientListeners: function (doc, evName, isInResult) {
            var i = this.listeners.length;
			if (this.options.count) {
				doc = null;	// we don't need to send a doc when query is a count query
			} else {
				if (evName === 'remove') {
					doc = doc._id.toString();	//remove needs only _id
				}
			}

            while(i--) {
                var listener = this.listeners[i];
                var uP = listener.socket.manager.user.privilige_level;
                doc = deleteUnpermittedProps(doc, 'R', uP);
                listener.rpcChannel.pubLQ(doc, evName, listener.clIndex, isInResult);
            }
        },
        removeListener: function (socket) {
            var li = this.listeners.length;
            while(li--) {
                if (this.listeners[li].socket === socket) {
                    this.listeners.splice(li, 1);
                    if (this.listeners.length === 0) {
                        this.destroy();
                    }
                    break;	// listener should be registered only once, so no need to continue loop
                }
            }
        }
    };

	function validateClientQuery(clientQuery) {	//errors are forwarded to client
		if (clientQuery.sort && !_.isString(clientQuery.sort)) {
			throw new Error('only string notation for sort method is supported for liveQueries');
		}
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
        unsubLQ: function (index) {	//when client uses stop method on LQ, this method gets called
			var LQ = this.registeredLQs[index];
            if (LQ) {
				this.registeredLQs.splice(index, 1);
				LQ.removeListener(this);
                return true;
            } else {
                return new Error('This index for LQ is not valid');
            }
        },
        /**
         *
         * @param {Object} clientQuery object to be parsed by queryBuilder, consult mongoose query.js docs for reference
         * @returns {Promise} from mongoose query, resolves with an array of documents
         */
        liveQuery: function (clientQuery) {
			try{
				validateClientQuery(clientQuery);
			}catch(e){
				return e;
			}
			if (!opts.checkPermission(this, 'R')) {
				return new Error('You lack a privilege to read this document');
			}
            if (!clientQuery) {
                clientQuery = {};
            }
            def = when.defer();

            accesControlQueryModifier(clientQuery, schema, this.manager.user.privilige_level, 'R');
			clientQuery.lean = true; // this should make query always lean

            var queryOptions = {};
			var moveParamToQueryOptions = function (param) {
				if (clientQuery.hasOwnProperty(param)) {
					queryOptions[param] = clientQuery[param];
					delete clientQuery[param];
				}
			};
			moveParamToQueryOptions('skip');
			moveParamToQueryOptions('limit');
			moveParamToQueryOptions('count');

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
                    var clIndex = socket.registeredLQs.indexOf(LQ);
                    if (clIndex === -1) {
                        	//already listening for that query
                        clIndex = socket.registeredLQs.push(LQ) - 1;	// index of current LQ
                        LQ.listeners.push({rpcChannel: clFns, socket: socket, clIndex: clIndex});
                    }

					var retVal;
					if (LQ.options.hasOwnProperty('count')) {
						retVal = {count: LQ.docs.length, index: clIndex};
					} else {
						var docsToPush;
						if (LQ.options && LQ.calculatePaginatedDocs()) {
							docsToPush = LQ.docsPaginated;
						} else {
							docsToPush = LQ.docs;
						}
						retVal = {docs: docsToPush, index: clIndex};
					}

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
                        LQ = new LiveQuery(qKey, mQuery, queryOptions, clientQuery);
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
                if (schema.paths.owner) {
                    //we should set the owner field if it is present
                    newDoc.owner = this.manager.user._id;
                }
                return model.create(newDoc);

			},
			remove: function (id) {
				
				var def = when.defer();
                var socket = this;
				model.findById(id, function (err, doc) {
					if (doc) {
                        if (opts.checkPermission(socket, 'D', doc)) {
                            doc.remove(function (err) {
                                if (err) {
                                    def.reject(err);
                                }
                                def.resolve();
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
			update: function (toUpdate) {

                var uPL = this.manager.user.privilige_level;
				var def = when.defer();
                var socket = this;
				var id = toUpdate._id;
				delete toUpdate._id;
				delete toUpdate.__v;
				model.findById(id, function (err, doc) {
					if (doc) {
                        if (opts.checkPermission(socket, 'U', doc)) {
                            deleteUnpermittedProps(toUpdate, 'W', uPL);
                            var previousVersion = doc.toObject();
                            _.extend(doc, toUpdate);
                            doc.__v += 1;
                            schema.eventBus.fire.call(doc, 'preupdate', previousVersion);

                            doc.save(function (err) {
                                if (err) {
                                    def.reject(err);
                                }
                                def.resolve();
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


