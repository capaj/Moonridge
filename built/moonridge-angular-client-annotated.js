angular.module('RPC', []).factory('$rpc', ["$rootScope", "$log", "$q", function ($rootScope, $log, $q) {
    var invocationCounter = 0;
    var endCounter = 0;
    var serverChannels = {};
    var clientChannels = {};
    var deferreds = [];
    var baseURL;
    var rpcMaster;
    var knownTemplates = {};

    var serverRunDate;  // used for invalidating the cache
    var serverRunDateDeferred = $q.defer();
    serverRunDateDeferred.promise.then(function (date) {
        serverRunDate = new Date(date);
    });

    var callEnded = function (Id) {
        if (deferreds[Id]) {
            delete deferreds[Id];
            endCounter++;
            rpc.onEnd(endCounter);
            if (endCounter == invocationCounter) {
                rpc.onBatchEnd(endCounter);
                invocationCounter = 0;
                endCounter = 0;
            }
        }else {
            $log.warn("Deferred Id " + Id + " was resolved/rejected more than once, this should not occur.");
        }
    };

    /**
     * Generates a 'safe' key for storing cache in client's local storage
     * @param name
     * @returns {string}
     */
    function getCacheKey(name) {
        return 'SIORPC:' + baseURL + '/' + name;
    }

    function cacheIt(key, data) {
        try{
            localStorage[key] = JSON.stringify(data);
        }catch(e){
            $log.warn("Error raised when writing to local storage: " + e); // probably quota exceeded
        }
    }

    var _loadChannel = function (name, handshakeData, deferred) {
        if (!serverChannels.hasOwnProperty(name)) {
            serverChannels[name] = {};
        }
        var channel = serverChannels[name];
        channel._loadDef = deferred;
        channel._handshake = handshakeData;
        serverRunDateDeferred.promise.then(function () {

            var cacheKey = getCacheKey(name);
            var cached = localStorage[cacheKey];
            if (cached) {
                cached = JSON.parse(cached);
                if (serverRunDate < new Date(cached.cDate)) {
                    if (handshakeData) {
                        rpcMaster.emit('authenticate', {name: name, handshake: handshakeData});
                        channel.cached = cached;
                    } else {
                        connectToServerChannel(channel, name);
                        registerRemoteFunctions(cached, false); // will register functions from cached manifest
                    }
                } else {
                    //cache has been invalidated
                    delete localStorage[cacheKey];
                    rpcMaster.emit('load channel', {name: name, handshake: handshakeData});
                }
            } else {
                rpcMaster.emit('load channel', {name: name, handshake: handshakeData});
            }
        });

        return channel._loadDef.promise;
    };

    var registerRemoteFunctions = function (data, storeInCache) {
        var channel = serverChannels[data.name];
        var remoteMethodInvocation = function (fnName) {
            channel[fnName] = function () {
                invocationCounter++;
                channel._socket.emit('call',
                    {Id: invocationCounter, fnName: fnName, args: Array.prototype.slice.call(arguments, 0)}
                );
                if (invocationCounter == 1) {
                    rpc.onBatchStarts(invocationCounter);
                }
                rpc.onCall(invocationCounter);
                deferreds[invocationCounter] = $q.defer();
                return deferreds[invocationCounter].promise;
            };
        };

        if (data.fnNames) {
            if (data.tplId) {
                //store the template
                knownTemplates[data.tplId] = data.fnNames;
            }
            data.fnNames.forEach(remoteMethodInvocation);   //initialize from incoming data
        } else {
            knownTemplates[data.tplId].forEach(remoteMethodInvocation); //this has to be initialized from known template
        }


        channel._loadDef.resolve(channel);
        if (storeInCache !== false) {
            $rootScope.$apply();
            data.cDate = new Date();    // here we make a note of when the channel cache was saved
            cacheIt(getCacheKey(data.name), data)
        }

    };

    /**
     *
     * @param {Object} channel
     * @param {String} name
     */
    var connectToServerChannel = function (channel, name) {
        var reconDfd = $q.defer();

        if (channel._socket) {
            return; //this was fired upon reconnect, so let's not register any more event subscribers
        }

        channel._socket = io.connect(baseURL + '/rpc-' + name)
            .on('resolve', function (data) {
                deferreds[data.Id].resolve(data.value);
                callEnded(data.Id);
            })
            .on('reject', function (data) {
                if (data && data.Id) {
                    deferreds[data.Id].reject(data.reason);
                    $log.error("Call " + data.Id + " is rejected, reason ", data.reason);

                    callEnded(data.Id);
                } else {
                    $log.error("Unknown error occured on RPC socket connection");
                }
            })
            .on('connectFailed', function (reason) {
                $log.error('unable to connect to namespace ', reason);
                channel._loadDef.reject(reason);
            })
            .on('disconnect', function (data) {
                channel._loadDef = reconDfd;
                $log.warn("Server channel " + name + " disconnected.");
            })
            .on('reconnect', function () {
                $log.info('reconnected channel' + name);
                _loadChannel(name, channel._handshake, reconDfd);
            });
    };

    /**
     * connects to remote server which exposes RPC calls
     * @param {String} url to connect to, for example http://localhost:8080
     * @param {Object} handshake for global authorization
     * returns {Socket} master socket namespace which you can use for looking under the hood
     */
    var connect = function (url, handshake) {

		if (!rpcMaster && url) {
            baseURL = url;
            rpcMaster = io.connect(url + '/rpc-master', handshake)
                .on('serverRunDate', function (runDate) {
                    serverRunDateDeferred.resolve(runDate);
                    $rootScope.$apply();
                })
                .on('authenticated', function (data) {
                    var name = data.name;
                    var channel = serverChannels[name];
                    connectToServerChannel(channel, name);
                    registerRemoteFunctions(channel.cached, false); // will register functions from cached manifest
                })
                .on('channelFns', function (data, storeInCache) {
                    var name = data.name;
                    var channel = serverChannels[name];
                    connectToServerChannel(channel, name);
                    registerRemoteFunctions(data, storeInCache);
                })
                .on('channelDoesNotExist', function (data) {

                    var channel = serverChannels[data.name];
                    channel._loadDef.reject();
                    $log.warn("no channel under name: " + data.name);
                    $rootScope.$apply();

                })
                .on('clientChannelCreated', function (name) {

                    var channel = clientChannels[name];
                    var socket = io.connect(baseURL + '/rpcC-' + name + '/' + rpcMaster.io.engine.id);  //rpcC stands for rpc Client
                    channel._socket = socket;
                    socket.on('call', function (data) {
                        var exposed = channel.fns;
                        if (exposed.hasOwnProperty(data.fnName) && typeof exposed[data.fnName] === 'function') {

                            var retVal = exposed[data.fnName].apply(this, data.args);
                            $q.when(retVal).then(function (retVal) {
								if (retVal instanceof Error) {
									// when synchronously returned Error
									socket.emit('reject', { Id: data.Id, reason: retVal.toString() });
								} else {
									socket.emit('resolve', { Id: data.Id, value: retVal });
								}
                            }, function (error) {
								if (error instanceof Error) {
									error = error.toString();
								}
								socket.emit('reject', { Id: data.Id, reason: error });
                            });

                        } else {
                            socket.emit('reject', {Id: data.Id, reason: 'no such function has been exposed: ' + data.fnName });
                        }
                    });
                    channel.deferred.resolve(channel);

                });

            return rpcMaster;

        } else {
            $log.warn("ignoring connect command, either url of master null or already connected");
        }
    };
    var rpc = {
        connect: connect,
        loadAllChannels: function () {
            if (rpcMaster) {
                rpcMaster.__channelListLoad = $q.defer();
                rpcMaster.emit('load channelList');
                rpcMaster
                    .on('channels', function (data) {
                        var name = data.list.pop();
                        while(name) {
                            serverChannels[name] = {};
                            _loadChannel(name);
                            name = data.list.pop();
                        }
                        rpcMaster.__channelListLoad.resolve(serverChannels);
                        $rootScope.$apply();

                    });
                return rpcMaster.__channelListLoad.promise;
            } else {
                $log.error("no connection to master");
            }

        },
        /**
         * for a particular channel this will connect and prepared the channel for use, if called more than once for one
         * channel, it will return it's instance
         * @param {string} name
         * @param {*} [handshakeData] custom param for authentication
         * @returns {promise}
         */
        loadChannel: function (name, handshakeData) {
            if (serverChannels.hasOwnProperty(name)) {
                return serverChannels[name]._loadDef.promise;
            } else {
                var def = $q.defer();
                _loadChannel(name, handshakeData, def);
                return def.promise;
            }
        },
        /**
         * @param {string} name of the channel
         * @param {Object} toExpose object with functions as values
         * @returns {Promise} a promise confirming that server is connected and can call the client, throws an error if already exposed
         */
        expose: function (name, toExpose) { //
            if (clientChannels.hasOwnProperty(name)) {
				throw new Error('Failed to expose channel, this client channel is already exposed');
            }

			var channel = {fns: toExpose, deferred: $q.defer()};
			clientChannels[name] = channel;

            var fnNames = [];
            for(var fn in toExpose)
            {
				if (fn === '_socket') {
					throw new Error('Failed to expose channel, _socket property is reserved for socket namespace');
				}
                fnNames.push(fn);
            }
			var expose = function() {
				rpcMaster.emit('exposeChannel', {name: name, fns: fnNames});
			};

			if (rpcMaster.connected) {
				// when no on connect event will be fired, we just expose the channel immediately
				expose();
			}

            rpcMaster
                .on('disconnect', function () {
                    channel.deferred = $q.defer();
                })
				.on('connect', expose)
                .on('reexposeChannels', expose);	//not sure if this will be needed, since simulating socket.io
                // reconnects is hard, leaving it here for now

			return channel.deferred.promise;
        },
		/**
		 * @param name
		 * @returns {Object} client channel
		 */
		getClientChannel: function(name) {
			return clientChannels[name];
		}
    };
    var nop = angular.noop;
	//These are internal callbacks of socket.io-rpc, use them if you want to implement something like a global loader indicator
    rpc.onBatchStarts = nop;	//called when invocation counter equals 1
    rpc.onBatchEnd = nop;		//called when invocation counter equals endCounter
    rpc.onCall = nop;			//called when invocation counter equals endCounter
    rpc.onEnd = nop;			//called when one call is returned
    rpc.auth = {};
    return rpc;
}]).directive('rpcController', ["$controller", "$q", "$rpc", function ($controller, $q, $rpc) {
    return {
		scope: true,
		compile: function compile(tEl, tAttrs) {
			return {
				pre: function (scope, iElement, attr, controller) {
                    if (!attr.rpcChannel) {
                        throw new Error("No channel name defined on rpc-controller element: " + iElement[0].outerHTML);
                    }
                    var ctrlName = attr.rpcController;
                    var instantiate = function (promise) {
                        promise.then(function (channel) {
                            var localInj = {
                                $scope: scope
                            };
                            localInj[attr.rpcChannel] = channel;
                            var ctrl = $controller(ctrlName, localInj);
                            iElement.children().data('$ngControllerController', ctrl);
                        }, function (err) {
                            $log.error("Cannot instantiate rpc-controller - channel failed to load");
                        });
                    };
                    if (attr.rpcAuth) {
						var authGetter = $rpc.auth[attr.rpcAuth];
						if (typeof authGetter !== 'function') {
							throw new Error('no auth getter function found under ' + attr.rpcAuth);
						}
                        $q.when(authGetter()).then(function (handshake) {

                            var promise = $rpc.loadChannel(attr.rpcChannel, handshake);
                            instantiate(promise);
                        });
					} else {
                        var promise = $rpc.loadChannel(attr.rpcChannel);
                        instantiate(promise);
                    }

                }
			};
		}
	}

}]);

angular.module('Moonridge', ['RPC']).factory('$MR', ["$rootScope", "$rpc", "QueryChainable", "$q", "$log", function $MR($rootScope, $rpc, QueryChainable, $q, $log) {
    var MRs = {}; //stores instances of Moonridge
    var defaultBackend;

    /**
     * A moonridge pseudo-constructor(don't call it with new keyword)
     * @param {String} name identifying the backend instance
     * @param {Promise} connectPromise should be resolved with an object with following properties:
     *                                  {String} url backend address where you will connect
     *                                  {Object} hs handshake for socket.io which you can access via socket.request._query
     * @param isDefault default if true, this backend will be used for any mr-controller, which does not have it defined
     * @returns {Object} Moonridge singleton
     */
    var Moonridge = function (name, connectPromise, isDefault) {
        var MRSingleton;

        if (MRs[name]) {
            return MRs[name];
        } else {
            MRSingleton = {};
            MRs[name] = MRSingleton;
        }

        var models = {};
        MRSingleton.connectPromise = $q.when(connectPromise).then(function (rParams) {
            var socket = $rpc.connect(rParams.url, rParams.hs);
            MRSingleton.socket = socket;

            return socket;
        });

        MRSingleton.getAllModels = function () {
            $rpc.loadChannel('Moonridge').then(function (mrChnl) {
                mrChnl.getModels().then(function (models) {
//                    TODO call getModel for all models
                });
            });
        };

        function onRejection(reason) {
            $log.error(reason);
            return $q.reject(reason);
        }

        /**
         * @param {String} name
         * @constructor
         */
        function Model(name) {
            var model = this;
            var lastIndex = 0;  //this is used for storing liveQueries in _LQs object as an index, each liveQuery has unique
            this.name = name;
            this._LQs = {};	// holds all liveQueries on client indexed by numbers starting from 1, used for communicating with the server
            this._LQsByQuery = {};	// holds all liveQueries on client indexed query in json, used for checking if the query does not exist already
            this.deferred = $q.defer();

			/**
			 * @param {Object} toUpdate moonridge object
			 * @returns {Promise}
			 */
            this.update = function (toUpdate) {
                delete toUpdate.$$hashKey;
				return model.rpc.update(toUpdate).catch(onRejection);
            };

            /**
             * deletes a $$hashkey and calls serverside method
             * @param toCreate
             * @returns {Promise}
             */
            this.create = function (toCreate) {
                delete toCreate.$$hashKey;
                return model.rpc.create(toCreate).catch(onRejection);
            };

            /**
             * @param toRemove
             * @returns {Promise}
             */
            this.remove = function (toRemove) {
                return model.rpc.remove(toRemove._id).catch(onRejection);
            };

            /**
             * @returns {Array<String>}
             */
            this.listPaths = function () {
                return model.rpc.listPaths().catch(onRejection);
            };

            /**
             * @returns {QueryChainable} which has same methods as mongoose.js query. When you chain all query
             *                           conditions, you use exec() to fire the query
             */
            this.query = function () {
                var query = {query:[], indexedByMethods: {}};
                return new QueryChainable(query, function () {
                    var callQuery = function () {
                        query.promise = model.rpc.query(query.query).then(function (result) {
                            if (query.indexedByMethods.findOne) {
                                query.doc = result;
                            } else {
                                query.docs = result;
                            }
                        });
                    };

                    query.exec = callQuery;
                    callQuery();

                    return query;
                }, model);
            };

            var createLQEventHandler = function (eventName) {
                return function (LQId, doc, isInResult) {
                    var LQ = model._LQs[LQId];
                    if (LQ) {
                        //updateLQ
                        LQ['on_' + eventName](doc, isInResult);
                        LQ._invokeListeners(eventName, arguments);  //invoking model event

                    } else {
                        $log.error('Unknown liveQuery calls this clients pub method, LQ id: ' + LQId);
                    }
                }
            };

            this.clientRPCMethods = {
                update: createLQEventHandler('update'),
                remove: createLQEventHandler('remove'),
                create: createLQEventHandler('create'),
                push: createLQEventHandler('push')
            };

            /**
             * @param {Object} previousLQ useful when we want to modify a running LQ, pass it after it is stopped
             * @returns {QueryChainable} same as query, difference is that executing this QueryChainable won't return
             *                           promise, but liveQuery object itself
             */
            this.liveQuery = function (previousLQ) {

                previousLQ && previousLQ.stop();

                var LQ = {_model: model, docs: [], count: 0};

                if (typeof Object.defineProperty === 'function') {
                    Object.defineProperty(LQ, 'doc', {
                        enumerable: false,
                        configurable: false,
                        get: function () {
                            return LQ.docs[0];
                        }
                    });
                }

                var eventListeners = {
                    update: [],
                    remove: [],
                    create: [],
                    push: [],
                    init:[],    //is fired when first query result gets back from the server
                    any: []
                };
                LQ._invokeListeners = function (which, params) {
                    if (which !== 'any') {
                        this._invokeListeners('any', params);
                    }

                    var index = eventListeners[which].length;
                    while(index--) {
                        eventListeners[which][index].call(LQ, params);
                    }
                };


                /**
                 * registers event callback on this model
                 * @param {String} evName
                 * @param {Function} callback
                 * @returns {Number}
                 */
                LQ.on = function (evName, callback) {
                    return eventListeners[evName].push(callback) - 1;
                };

                /**
                 * unregisters previously registered event callback
                 * @param {String} evName
                 * @param {Number} evId
                 * @returns {Boolean} true when event was unregistered, false when not found
                 */
                LQ.off = function (evName, evId){
                    if (eventListeners[evName][evId]) {
                        delete eventListeners[evName][evId];
                        return true;
                    } else {
                        return false;
                    }
                };

                if (angular.isObject(previousLQ)) {
                    LQ.query = previousLQ.query;
                    LQ.indexedByMethods = previousLQ.indexedByMethods;
                } else {
                    LQ.query = [];  //serializable query object
                    // utility object to which helps when we need to resolve query type and branch our code
                    LQ.indexedByMethods = {};
                }

				LQ.getDocById = function (id) {
					var i = LQ.docs.length;
					while (i--) {
						if (LQ.docs[i]._id === id) {
							return LQ.docs[i];
						}
					}
					return null;
				};
                LQ.recountIfNormalQuery = function () {
                    if (!LQ.indexedByMethods.count) {
                        LQ.count = LQ.docs.length;
                    }
                };
				//syncing logic
				LQ.on_create = function (doc, index) {
					LQ.promise.then(function () {
						if (LQ.indexedByMethods.count) {
							LQ.count += 1; // when this is a count query, just increment and call it a day
							return;
						}

						if (angular.isNumber(index)) {
							LQ.docs.splice(index, 0, doc);
						} else {
							LQ.docs.push(doc);
						}
						if (LQ.indexedByMethods.limit < LQ.docs.length) {
							LQ.docs.splice(LQ.docs.length - 1, 1);  // this needs to occur after push of the new doc
						}
						LQ.recountIfNormalQuery();
					});
                };
				LQ.on_push = LQ.on_create;  //used when item is not new but rather just was updated and fell into query results
				/**
				 *
				 * @param {Object} doc
				 * @param {bool|Number} isInResult for count it indicates whether to increment, decrement or leave as is,
			     * 								   for normal queries can be a numerical index also
				 */
				LQ.on_update = function (doc, isInResult) {
					LQ.promise.then(function () {
						if (LQ.indexedByMethods.count) {	// when this is a count query
							if (angular.isNumber(isInResult)) {
								LQ.count += 1;
							} else {
								if (isInResult === false) {
									LQ.count -= 1;
								}
								if (isInResult === true) {
									LQ.count += 1;
								}
							}
							return;// just increment/decrement and call it a day
						}

						var i = LQ.docs.length;
						while (i--) {
							var updated;
							if (LQ.docs[i]._id === doc._id) {
								if (isInResult === false) {
									LQ.docs.splice(i, 1);  //removing from docs
									return;
								} else {
									// if a number, then doc should be moved
									if (angular.isNumber(isInResult)) {	//LQ with sorting
										if (isInResult !== i) {
											if (i < isInResult) {
												LQ.docs.splice(i, 1);
												LQ.docs.splice(isInResult - 1, 0, doc);
											} else {
												LQ.docs.splice(i, 1);
												LQ.docs.splice(isInResult, 0, doc);
											}

										} else {
											updated = LQ.docs[i];
											angular.extend(updated, doc);
										}

									} else {
										updated = LQ.docs[i];
										angular.extend(updated, doc);
									}

								}

								return;
							}
						}
						//when not found
						if (isInResult) {
							if (angular.isNumber(isInResult)) {	//LQ with sorting
								LQ.docs.splice(isInResult, 0, doc);
							} else {
								LQ.docs.push(doc); // pushing into docs if it was not found by loop
							}
							return;
						}
						$log.error('Failed to find updated document.');
						LQ.recountIfNormalQuery();
					});
                };
				/**
				 *
				 * @param {String} id
				 * @returns {boolean} true when it removes an element
				 */
				LQ.on_remove = function (id) {
					LQ.promise.then(function () {
						if (LQ.indexedByMethods.count) {
							LQ.count -= 1;	// when this is a count query, just decrement and call it a day
							return true;
						}

						var i = LQ.docs.length;
						while (i--) {
							if (LQ.docs[i]._id === id) {
								LQ.docs.splice(i, 1);
								LQ.count -= 1;
								return true;
							}
						}
						$log.error('Failed to find deleted document.');

						return false;
					});
				};
				//notify the server we don't want to receive any more updates
                LQ.stop = function () {
					if (angular.isNumber(LQ.index) && model._LQs[LQ.index] ) {
                        LQ.stopped = true;
                        model.rpc.unsubLQ(LQ.index).then(function (succes) {
							if (succes) {
                                if (LQ.indexedByMethods.count) {
                                    LQ.count = 0;
                                } else {
                                    LQ.doc = null;
                                    LQ.docs = [];
                                }
								delete model._LQs[LQ.index];
                                delete model._LQsByQuery[LQ._queryStringified];

							}
						});

					} else {
						throw new Error('There must be a valid index property, when stop is called')
					}
				};

                /**
                 * @param {Boolean} onReconnect when true, no events from socket will be subscribed
                 * @returns {Object} live query object with docs property which contains realtime result of the query
                 */
                var queryExecFn = function (onReconnect) {
                    if (!LQ._queryStringified) {
                        if (LQ.indexedByMethods.hasOwnProperty('count') && LQ.indexedByMethods.hasOwnProperty('sort')) {
                            throw new Error('count and sort must NOT be used on the same query');
                        }
                        LQ._queryStringified = JSON.stringify(LQ.query);
                        if (model._LQsByQuery[LQ._queryStringified] && model._LQsByQuery[LQ._queryStringified].stopped !== true) {
                            return model._LQsByQuery[LQ._queryStringified];
                        }

                        //if previous check did not found an existing query
                        model._LQsByQuery[LQ._queryStringified] = LQ;

                        lastIndex += 1;

                        model._LQs[lastIndex] = LQ;
                        LQ.index = lastIndex;

                    }

                    LQ.promise = model.rpc.liveQuery(LQ.query, LQ.index).then(function (res) {

                        if (angular.isNumber(res.count)) {  // this is a count query when servers sends number
                            //$log.debug('Count we got back from the server is ' + res.count);

                            // this is not assignment but addition on purpose-if we create/remove docs before the initial
                            // count is determined we keep count of them inside count property. This way we stay in sync
                            // with the real count
                            LQ.count += res.count;

                        } else {

                            var i = res.docs.length;
                            LQ.count += i;
                            //TODO here we need to merge the result of the query with changes which occured while the
                            // query ran, so we can't just iterate
                            while(i--) {
                                LQ.docs[i] = res.docs[i];
                            }

                        }
                        LQ._invokeListeners('init', res);

                        if (!onReconnect) {
                            MRSingleton.socket.on('disconnect', function () {
                                LQ.stopped = true;
                            });

                            MRSingleton.socket.on('reconnect', function () {
                                //TODO maybe we have to wait until model.rpc can be called
                                LQ.docs = [];
                                LQ.count = 0;

                                queryExecFn(true);

                            });
                        } else {
                            LQ.stopped = false;
                        }

                        return LQ;	//
                    }, onRejection);

                    return LQ;
                };

                return new QueryChainable(LQ, queryExecFn, model);
            }
        }

        /**
         * loads one model or returns already requested model promise
         * @param {String} name
         * @param {Object} handshake
         * @returns {Promise} which resolves with the model
         */
		MRSingleton.getModel = function (name, handshake) {
            var model = models[name];
            if (model) {
                return model.deferred.promise;
            }

            model = new Model(name);
            models[name] = model;

            MRSingleton.connectPromise.then(function () {
				var ccName = 'MR-' + name;
				var promises = {
                    client: $rpc.expose(ccName, model.clientRPCMethods),
                    server: $rpc.loadChannel(ccName, handshake)
                };

                $q.all(promises).then(function (chnlPair) {
                    model.rpc = chnlPair.server;
                    model.deferred.resolve(model);
                });

                MRSingleton.socket.on('disconnect', function () {
                    console.log("model disconnect");
                    model.deferred = $q.defer();
                });

                MRSingleton.socket.on('reconnect', function () {
                    console.log("model reconnect");

                    var promises = {
                        client: $rpc.getClientChannel(ccName).deferred.promise,
                        server: $rpc.loadChannel(ccName, handshake)
                    };

                    $q.all(promises).then(function (chnlPair) {
                        console.log("model reconnect resolve both client and server channel");

                        model.rpc = chnlPair.server;
                        model.deferred.resolve(model);
                    });
                });
            });

			return model.deferred.promise;
		};

        /**
         * loads more than one model
         * @param {Array<string>} models
         * @param handshake
         * @returns {Promise} which resolves with an Object where models are indexed by their names
         */
        MRSingleton.getModels = function (models, handshake) {
            var promises = {};
            var index = models.length;
            while(index--) {
                var modelName = models[index];
                promises[modelName] = MRSingleton.getModel(modelName, handshake);
            }
            return $q.all(promises);
        };

        if (isDefault) {
            defaultBackend = MRSingleton;
        }

        return MRSingleton;
    };
    /**
     * simple getter for MRs stored instances
     * @param {String} name
     * @returns {*}
     */

    Moonridge.getBackend = function (name) {
        if (MRs[name]) {
            return MRs[name];
        } else {
            throw new Error('no such Moonridge backend');
        }
    };

    Moonridge.getDefaultBackend = function () {
        return defaultBackend;
    };

    return Moonridge;
}]);

angular.module('Moonridge').factory('MRMethodsClientValidations', function () {
    function isInt(n) {
        return typeof n === 'number' && n % 1 == 0;
    }

    var noop = function (args) {
        return true;
    };

    var singleIntegerValidation = function (args) {
        if (args.length === 1) {
            if (isInt(args[0])) {
                return true;
            } else {
                return new TypeError('Argument must be an integer');
            }
        }
        return new Error('Method must be called with exactly one Number argument');
    };

    /**
     * query methods which modifies the collection are not included, those have to be called via RPC methods
     * @type {Object.<string, Function>} name of the method and validation function
     */
    var qMethodsEnum = {
        all: noop,
        and: noop,
        box: noop,
        center: noop,
        centerSphere: noop,
        circle: noop,
        comment: noop,
        count: noop,    //available on client, but done in server memory
        //	distinct: noop,		//must be done in server memory, TODO implement this
        elemMatch: noop,
        equals: noop,
        exists: noop,
        find: noop,
        findOne: function (args) {
            if (args.length === 0) {
                return true;
            } else {
                if (args.length > 1) {
                    return new Error("FindOne does not take more than one argument");
                }
                if (typeof args[0] !== 'object') {
                    return new TypeError("FindOne takes just one Object as argument");
                }
                return true;
            }
        },
        geometry: noop,
        gt: noop,
        gte: noop,
        hint: noop,
        in: noop,
        intersects: noop,
//		lean: noop, //always enabled
        limit: singleIntegerValidation,
        lt: noop,
        lte: noop,
        maxDistance: noop,
        maxScan: singleIntegerValidation,
        mod: noop,
        ne: noop,
        near: noop,
        nearSphere: noop,
        nin: noop,
        nor: noop,
        or: noop,
        polygon: noop,
        populate: noop,
        read: noop,
        regex: noop,
        select: noop,
        size: noop,
        skip: singleIntegerValidation,	//is not sent to the DB, skipping and limiting is done in memory because it would be a problem for liveQueries
        slice: noop,
        sort: noop,
        where: function (args) {
            if (args.length > 0 && args.length <= 2) {
                return true;    //TODO check types here
            }
            return new Error('Method was called with wrong number of arguments');
        },
        within: noop
    };
    
    return qMethodsEnum;
});
angular.module('Moonridge').factory('QueryChainable', ["MRMethodsClientValidations", function (MRMethodsClientValidations) {

    //Moonridge methods which aren't run against the DB but rather just in memory
    var callJustOnce = [
        'findOne',
        'select',
        'count',
        'sort',
        'limit',
        'skip'
    ];

    /**
     * is used for emulating mongoose query
     * @param {Object} queryMaster
     * @param {Function} execFn which always returns a promise
     * @param {Model} model
     * @constructor
     */
    function QueryChainable(queryMaster, execFn, model) {
        var self = this;
        this.exec = execFn;
        this._model = model;

        var APslice = Array.prototype.slice;

        var createMethod = function (method) {
            self[method] = function () {
                var argsArray = APslice.call(arguments);

                //perform validation
                var validationResult = MRMethodsClientValidations[method](argsArray);
                if (validationResult instanceof Error) {
                    throw validationResult;
                }
                var qr = queryMaster.query;

                if (callJustOnce.indexOf(method) !== -1) {
                    if (queryMaster.indexedByMethods[method]) {

                        var qrIndex = qr.length;
                        while(qrIndex--) {
                            if (qr[qrIndex].mN === method) {
                                qr.splice(qrIndex, 1);  //remove from query array because
                            }
                        }
                    }

                    queryMaster.indexedByMethods[method] = argsArray; //we shall add it to the options, this object will be used when reiterating on LQ

                }

                qr.push({mN: method, args: argsArray});

                return self;
            };
        };

        for (var method in MRMethodsClientValidations) {
            createMethod(method);
        }

    }
    return QueryChainable;
}]);
/**
 * @ngdoc directive
 * @name Moonridge.directive:mrController
 * @restrict AC
 *
 * @description
 * Will instantiate angular controller when Moonridge model resolves. This way it is possible to work with it instantly
 * without waiting on promises to resolve inside the controller itself.
 *
 */
angular.module('Moonridge').directive('mrController', ["$controller", "$q", "$MR", function ($controller, $q, $MR) {
    var onError = function (err) {
        throw new Error("Cannot instantiate mr-controller - error: " + err);
    };
    return {
        scope: true,
        compile: function compile(tEl, tAttrs) {
            return {
                pre: function (scope, iElement, attr, controller) {
                    var ctrlName = attr.mrController;
                    var MR;
                    if (attr.mrBackend) {
                        MR = $MR.getBackend(attr.mrBackend);
                    } else {
                        MR = $MR.getDefaultBackend();
                    }
                    var mrModels = attr.mrModels;

                    var instantiateAngularCtrl = function (models) {
                        scope.$on('$destroy', function() {
                            //TODO stop liveQueries
                        });
                        var localInj = {
                            $scope: scope
                        };
                        if (mrModels.indexOf(',') !== -1) {
                            angular.extend(localInj, models);
                        } else {
                            localInj[mrModels] = models;
                        }

                        var ctrl = $controller(ctrlName, localInj);
                        iElement.children().data('$ngControllerController', ctrl);
                    };

                    if (mrModels === undefined) {
                        throw new Error('No Moonridge models defined on element: ' + el);
                    } else {
                        if (mrModels.indexOf(',') !== -1) {
                            MR.getModels(mrModels.split(',')).then(instantiateAngularCtrl, onError);
                        } else {
                            MR.getModel(mrModels).then(instantiateAngularCtrl, onError);
                        }
                    }
                }
            };
        }
    }
}])
/**
 * @ngdoc directive
 * @name Moonridge.directive:mrRepeat
 * @restrict A
 *
 * @description
 * syntactic sugar on top of ng-repeat directive. Will be replaced in linking phase by ng-repeat directive,
 * appends track by {model_name}._id if no track by expression is specified
 *
 */
    .directive('mrRepeat', ["$compile", "mrSpinner", function ($compile, mrSpinner) {
        var trackingProp = '_id'; //the same property that mongoose uses for identification of docs
        return {
            compile: function compile(tEl, tAttrs) {
                var content = tEl.html();
                tEl.html(mrSpinner);
                return function (scope, el, attr) {
                    var repeatExpr = attr.mrRepeat;
                    var filterExpr = '';
                    if (repeatExpr.indexOf('|') !== -1) {
                        filterExpr = ' |' + repeatExpr.split('|')[1];	//everything after |
                        repeatExpr = repeatExpr.split('|')[0].trim();
                    }
                    var modelName = repeatExpr.split(' in ')[0];
                    var varName = repeatExpr.split(' in ')[1];	//property on scope holding the query promise

                    var trackingExpr = '';
                    if (repeatExpr.indexOf('track by') === -1) {
                        trackingExpr = ' track by ' + modelName + '.' + trackingProp;
                    }

                    var LQ;
                    function onReady(resolveP) {
                        el.removeAttr('mr-repeat');
                        if (LQ) {
                            el.attr('ng-repeat', repeatExpr + '.docs' + filterExpr + trackingExpr);
                        } else {
                            el.attr('ng-repeat', repeatExpr  + filterExpr + trackingExpr);
                            scope[varName] = resolveP;   // overwriting the promise on scope with result of the query
                        }

                        el.html(content);
                        $compile(el)(scope);

                        if (LQ && !attr.noStopping) {
                            scope.$on('$destroy', function() {
                                LQ.stop();
//                                console.log("Query " + LQ._queryStringified + ' was stopped automatically.');
                            });

                        }
                    }

                    scope.$watch(varName, function (nV) {
                        if (nV) {
                            if (nV.promise) {	//when this is liveQuery
                                LQ = nV;
                                nV.promise.then(onReady);

                            } else if(nV.then) {	//when this is one time query
                                nV.then(onReady);
                            }
                        }
                    });

                }

            }
        }
    }]).value('mrSpinner',
        '<div class="spinner">'+
        '<div class="rect1"></div>'+
        '<div class="rect2"></div>'+
        '<div class="rect3"></div>'+
        '<div class="rect4"></div>'+
        '<div class="rect5"></div>'+
        '</div>');
angular.module('Moonridge').run(['$templateCache', function($templateCache) {
  'use strict';

  $templateCache.put('moonridge_query_dropdown.html',
    "<div class=\"moonridge-query-dropdown btn-group\">\r" +
    "\n" +
    "    <a class=\"btn btn-default dropdown-toggle\" data-toggle=\"dropdown\">\r" +
    "\n" +
    "        Sort and filter <span class=\"caret\"></span>\r" +
    "\n" +
    "    </a>\r" +
    "\n" +
    "    <ul class=\"dropdown-menu\" role=\"menu\">\r" +
    "\n" +
    "        <li ng-repeat=\"path in paths\">\r" +
    "\n" +
    "            <div class=\"row\" ng-if=\"mrDropdown_guiPathTexts[$index] !== false\">\r" +
    "\n" +
    "                <div class=\"col-md-4\">\r" +
    "\n" +
    "                    <span ng-class=\"{active: getSortTokens().indexOf('-' + path) !== -1}\"\r" +
    "\n" +
    "                            class=\"glyphicon glyphicon-sort-by-attributes-alt\" ng-click=\"sortBy('-' + path, $event)\"></span>\r" +
    "\n" +
    "                    <span ng-class=\"{active: getSortTokens().indexOf(path) !== -1}\"\r" +
    "\n" +
    "                            class=\"glyphicon glyphicon-sort-by-attributes\" ng-click=\"sortBy(path, $event)\"></span>\r" +
    "\n" +
    "                </div>\r" +
    "\n" +
    "                <div class=\"col-md-8\">\r" +
    "\n" +
    "                    <a ng-bind=\"mrDropdown_guiPathTexts[$index] || path\" ng-click=\"switchSort(path)\"></a>\r" +
    "\n" +
    "                </div>\r" +
    "\n" +
    "            </div>\r" +
    "\n" +
    "        </li>\r" +
    "\n" +
    "    </ul>\r" +
    "\n" +
    "</div>"
  );

}]);

angular.module('Moonridge').directive('mrQueryDropdown', ["$log", function ($log) {
    return {
        restrict: 'EA',
        templateUrl: 'moonridge_query_dropdown.html',
        link: function (scope, elem, attrs) {
            var modelName;
            var LQScopeProp = attrs.query;

            scope.$watch(LQScopeProp, function (query) {
                if (query && query._model && query._model.rpc){
                    scope.mrDropdown_guiPathTexts = scope.$eval(attrs.guiPathTexts);

                    if (modelName !== query._model.name) {
                        modelName = query._model.name;
                        query._model.rpc.listPaths().then(function (paths) {
                            $log.log("mrQueryDropdown", paths);
                            scope.paths = paths;
                        });

                        scope.getSortTokens = function () {
                            return scope[LQScopeProp].indexedByMethods.sort[0].split(' ');
                        };


                        /**
                         * @param {String} sortPath
                         * @param {Event} ev
                         */
                        scope.sortBy = function (sortPath, ev) {
                            $log.log(sortPath, ev);

                            if (ev.shiftKey) {
                                //append sort path to existing
                            } else {
                                var newLQ = query._model.liveQuery(scope[LQScopeProp]);
                                scope[LQScopeProp] = newLQ.sort(sortPath).exec();

                            }
                        }
                    }

                }
            });

        }
    }
}]);