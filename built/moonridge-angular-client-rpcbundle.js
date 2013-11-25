angular.module('RPC', []).factory('$rpc', function ($rootScope, $q) {
    var invocationCounter = 0;
    var endCounter = 0;
    var serverChannels = {};
    var clientChannels = {};
    var deferreds = [];
    var baseURL;
    var rpcMaster;
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
            console.warn("Deferred Id " + Id + " was resolved/rejected more than once, this should not occur.");
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
            console.warn("Error raised when writing to local storage: " + e); // probably quoata exceeded
        }
    }

    var _loadChannel = function (name, handshakeData, deferred) {
        if (!serverChannels.hasOwnProperty(name)) {
            serverChannels[name] = {};
        }
        var channel = serverChannels[name];
        channel._loadDef = deferred;
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
        data.fnNames.forEach(function (fnName) {
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
        });

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

        channel._socket = io.connect(baseURL + '/rpc-' + name)
            .on('return', function (data) {
                deferreds[data.Id].resolve(data.value);
                callEnded(data.Id);
            })
            .on('error', function (data) {
                if (data && data.Id) {
                    deferreds[data.Id].reject(data.reason);
                    callEnded(data.Id);
                } else {
                    console.error("Unknown error occured on RPC socket connection");
                }
            })
            .on('connect_failed', function (reason) {
                console.error('unable to connect to namespace ', reason);
                channel._loadDef.reject(reason);
            })
            .on('disconnect', function (data) {
                delete serverChannels[name];
                console.warn("Server channel " + name + " disconnected.");
            });
    };

    /**
     * connects to remote server which exposes RPC calls
     * @param {String} url to connect to, for example http://localhost:8080
     * @param {Object} handshake for global authorization
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
                    console.warn("no channel under name: " + data.name);
                    $rootScope.$apply();

                })
                .on('client channel created', function (name) {

                    var channel = clientChannels[name];
                    var socket = io.connect(baseURL + '/rpcC-' + name + '/' + rpcMaster.socket.sessionid);  //rpcC stands for rpc Client
                    channel._socket = socket;
                    socket.on('call', function (data) {
                        var exposed = channel.fns;
                        if (exposed.hasOwnProperty(data.fnName) && typeof exposed[data.fnName] === 'function') {

                            var retVal = exposed[data.fnName].apply(this, data.args);
                            $q.when(retVal).then(function (retVal) {
								if (retVal instanceof Error) {
									// when synchronously returned Error
									socket.emit('error', { Id: data.Id, reason: retVal.toString() });
								} else {
									socket.emit('return', { Id: data.Id, value: retVal });
								}
                            }, function (error) {
                                socket.emit('error', { Id: data.Id, reason: error });
                            });

                        } else {
                            socket.emit('error', {Id: data.Id, reason: 'no such function has been exposed: ' + data.fnName });
                        }
                    });
                    channel.deferred.resolve(channel);

                });

        } else {
            console.warn("ignoring connect command, either url of master null or already connected");
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
                console.error("no connection to master");
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
         * @param name {string}
         * @param toExpose {Object} object with functions as values
         * @returns {Promise} a promise saying that server is connected and can call the client
         */
        expose: function (name, toExpose) { //
            if (!clientChannels.hasOwnProperty(name)) {
                clientChannels[name] = {};
            }
            var channel = clientChannels[name];
            channel.fns = toExpose;
            channel.deferred = $q.defer();
            var fnNames = [];
            for(var fn in toExpose)
            {
				if (fn === '_socket') {
					throw new Error('Failed to expose channel, _socket property is reserved for socket namespace');
				}
                fnNames.push(fn);
            }

            rpcMaster.emit('expose channel', {name: name, fns: fnNames});
            return channel.deferred.promise;
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
}).directive('rpcController', function ($controller, $q, $rpc) {
    return {
		scope: true,
		compile: function compile(tEl, tAttrs) {
			return {
				pre: function (scope, iElement, attr, controller) {
					var ctrlName = attr.rpcController;
                    var instantiate = function (promise) {
                        promise.then(function (channel) {
                            scope.rpc = channel;
                            var ctrl = $controller(ctrlName, {
                                $scope: scope
                            });
                            iElement.children().data('$ngControllerController', ctrl);
                        }, function (err) {
                            console.error("Cannot instantiate rpc-controller - channel failed to load");
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

});

angular.module('Moonridge', ['RPC']).factory('$MR', function $MR($rootScope, $rpc, $q, $log) {
    var MRs = {}; //stores instances of Moonridge

    /**
     * A moonridge pseudo-constructor(don't call it with new keyword)
     * @param {String} name identifying the backend instance
     * @param {Object} params
     * @param {String} params.url backend adress
     * @param {Object} params.hs handshake for socket.io
     * @returns {*}
     */
    var Moonridge = function (name, params) {
        var MRInstance;

        if (MRs[name]) {
            return MRs[name];
        } else {
            MRInstance = {};
            MRs[name] = MRInstance;
        }

        var models = {};
        var connectPromise = $q.when(params).then(function (rParams) {
            $rpc.connect(rParams.url, rParams.hs);
        });

        MRInstance.getAllModels = function () {
            $rpc.loadChannel('Moonridge').then(function (mrChnl) {
                mrChnl.getModels().then(function (models) {
//                    TODO call getModel for all models
                });
            });
        };

        /**
         * @constructor
         */
        function Model() {
            var model = this;
            this._LQs = [];	// holds all
            this.deferred = $q.defer();
//            this.methods = rpc;

            /**
             *
             * @param {Object} query NOTE: do not use + sign in select expressions
             * @returns {Promise|*}
             */
            this.liveQuery = function (query) {
				var LQ = {};

				LQ.query = query || {};

				var actionsOnResponse = function (first) {
					LQ.promise = LQ.promise.then(function (res) {
						if (first) {
							LQ._waitingOnFirstResponse = false;
						}
						var index = res.index;

						model._LQs[index] = LQ;
						LQ.index = index;
						LQ.docs = res.docs;

						return LQ;	//
					}, function (err) {
						$log.error(err);
					});
				};

				LQ._waitingOnFirstResponse = true;
				LQ.promise = model.rpc.liveQuery(query);
				actionsOnResponse(true);

				$rootScope.$watch(function () {
					return LQ.query;
				}, function (nV, oV) {
					if (angular.isUndefined(nV)) {
						return;
					}
					if (!LQ._waitingOnFirstResponse) {
						LQ.stop && LQ.stop();
						LQ.promise = model.rpc.liveQuery(nV);
					}

					actionsOnResponse();

				}, true);

				LQ.getDocById = function (id) {
					var i = LQ.docs.length;
					while (i--) {
						if (LQ.docs[i]._id === id) {
							return LQ.docs[i];
						}
					}
					return null;
				};
				//syncing logic
				LQ.on_create = function (doc, index) {
					if (angular.isNumber(index)) {
						LQ.docs.splice(index, 0, doc);
					} else {
						LQ.docs.push(doc);
					}
				};
				LQ.on_push = LQ.on_create;
				LQ.on_update = function (doc, isInResult) {
					var i = LQ.docs.length;
					while (i--) {
						var updated;
						if (LQ.docs[i]._id === doc._id) {
							if (isInResult === false) {
								docs.splice(i, 1);  //removing from docs
								return;
							} else {
                                // if a number, then doc should be moved
                                if (angular.isNumber(isInResult)) {	//LQ with sorting
                                    if (isInResult !== i) {
                                        LQ.docs.splice(i, 1);
                                        LQ.docs.splice(isInResult, 0, doc);
                                    } else {
                                        updated = LQ.docs[i];
                                        angular.extend(updated, doc);
                                    }

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
				};
				LQ.on_remove = function (id) {
					var i = LQ.docs.length;
					while (i--) {
						if (LQ.docs[i]._id === id) {
							LQ.docs.splice(i, 1);
							return true;
						}
					}
					$log.error('Failed to find deleted document.');

					return false;
				};
				//syncing logic ends
				LQ.stop = function () {
					if (angular.isNumber(LQ.index) && model._LQs[LQ.index] ) {

						model.rpc.unsubLQ(LQ.index);
						model.stopped = true;
						delete model._LQs[LQ.index];

					} else {
						throw new Error('There must be a valid index property, when stop is called')
					}
				};

				return LQ;
            }
        }

		//
		MRInstance.getModel = function (name, handshake) {
            var model = models[name];
            if (model) {
                return model.deferred.promise
            } else {
                model = new Model();
                models[name] = model;
            }

            connectPromise.then(function () {
                var promises = {
                    client: $rpc.expose('MR-' + name, {
                        pub: function (doc, eventName) {
                            //todo implement
                        },
                        pubLQ: function (doc, eventName, LQId, isInResult) {
                            if (model._LQs[LQId]) {
                                //updateLQ
                                model._LQs[LQId]['on_' + eventName](doc, isInResult);
                            } else {
                                $log.error('Unknown liveQuery calls this clients pub method, LQ id: ' + LQId);
                            }
                        }
                    }),
                    server: $rpc.loadChannel('MR-' + name, handshake)
                };


                $q.all(promises).then(function (chnlPair) {
                    model.rpc = chnlPair.server;
                    model.deferred.resolve(model);
                });
            });


			return model.deferred.promise;

		};

        return MRInstance;
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

    return Moonridge;
})
/**
 * @ngdoc directive
 * @name Moonridge.directive:mrController
 * @restrict AC
 *
 * @description
 * Will instantiate angular controller when Moonridge model resolves. This way it is possible to work with it
 * without waiting on promises to resolve.
 *
  */
.directive('mrController', function ($controller, $q, $MR) {
    return {
        scope: true,
        compile: function compile(tEl, tAttrs) {
            return {
                pre: function (scope, iElement, attr, controller) {
                    var ctrlName = attr.mrController;
                    var backend = attr.mrBackend;

                    var MR = $MR.getBackend(backend);
                    var instantiateAngularCtrl = function (model) {
                        scope.MR = model;	//MR for Moonridge
                        var ctrl = $controller(ctrlName, {
                            $scope: scope
                        });
                        iElement.children().data('$ngControllerController', ctrl);
                    };
                    var onError = function (err) {
                        throw new Error("Cannot instantiate mr-controller - error: " + err);
                    };
                    if (attr.mrModel) {
                        MR.getModel(attr.mrModel).then(instantiateAngularCtrl, onError);
                    }else if(attr.mrModels){
                        var mNames = attr.mrModels.split(',');
                        var promises = {};
                        mNames.forEach(function (name) {
                            promises[name] = MR.getModel(name);
                        });
                        $q.all(promises).then(instantiateAngularCtrl, onError);
                    }


                }
            };
        }
    }
}).directive('mrRepeat', function ($controller, $q, $MR) {
    return {
        compile: function compile(tEl, tAttrs) {
            var LQprop = tEl.attr('mr-repeat');
            tEl.attr('ng-repeat', LQprop + '.docs');
            return {
                pre: function (scope, iElement, attr, controller) {
                    var LQ = scope[LQprop];
                    //TODO make this work
//                    scope.$watch(LQprop + '.query', function (nV, oV) {
//                        if (nV) {
//                            if (nV.sort) {
//                                if (angular.isString()) {
//                                    var val = iElement.attr('ng-repeat');
//                                    iElement.attr('ng-repeat', val + "| orderBy:'" + LQ.query.sort + "'");
//                                }
//                            }
//                        }
//                    });


                }
            };
        }
    }
});