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
        rpcMaster.emit('load channel', {name: name, handshake: handshakeData});
        if (!serverChannels.hasOwnProperty(name)) {
            serverChannels[name] = {};
        }
        var channel = serverChannels[name];
        channel._loadDef = deferred;
        serverRunDateDeferred.promise.then(function () {
            channel._socket = io.connect(baseURL + '/rpc-' + name, handshakeData)
                .on('return', function (data) {
                    deferreds[data.Id].resolve(data.value);
                    $rootScope.$apply();
                    callEnded(data.Id);
                })
                .on('error', function (data) {
                    if (data && data.Id) {
                        if (deferreds[data.Id]) {
                            deferreds[data.Id].reject(data.reason);
                            $rootScope.$apply();
                            callEnded(data.Id);
                        } else {
                            console.warn('Deffered Id ' + data.Id + ' has been already resolved/rejected.');
                        }
                    } else {
                        console.error("Unknown error occured on RPC socket connection");
                    }

                })
                .on('connect_failed', function (reason) {
                    console.error('unable to connect to namespace ', reason);
                    channel._loadDef.reject(reason);
                    $rootScope.$apply();

                })
                .on('disconnect', function (data) {
                    delete serverChannels[name];
                    console.warn("Server channel " + name + " disconnected.");
                });

            var cacheKey = getCacheKey(name);
            var cached = localStorage[cacheKey];
            if (cached) {
                cached = JSON.parse(cached);
                if (serverRunDate < new Date(cached.cDate)) {
                    registerRemoteFunctions(cached, false); // will register functions from cached manifest
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
        var channelObj = serverChannels[data.name];
        data.fnNames.forEach(function (fnName) {
            channelObj[fnName] = function () {
                invocationCounter++;
                channelObj._socket.emit('call',
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

        channelObj._loadDef.resolve(channelObj);
        if (storeInCache !== false) {
            $rootScope.$apply();
            data.cDate = new Date();    // here we make a note of when the channel cache was saved
            cacheIt(getCacheKey(data.name), data)
        }

    };
    /**
     * @param {String} url
     */
    var connect = function (url) {
        if (!rpcMaster && url) {
            baseURL = url;
            rpcMaster = io.connect(url + '/rpc-master')
                .on('serverRunDate', function (runDate) {
                    serverRunDateDeferred.resolve(runDate);
                    $rootScope.$apply();
                })
                .on('channelFns', registerRemoteFunctions)
                .on('channelDoesNotExist', function (data) {
                    var channelObj = serverChannels[data.name];
                    channelObj._loadDef.reject();
                    console.warn("no channel under name: " + data.name);
                    $rootScope.$apply();

                })
                .on('client channel created', function (name) {

                    var channel = clientChannels[name];
                    var socket = io.connect(baseURL + '/rpcC-' + name + '/' + rpcMaster.socket.sessionid);  //rpcC stands for rpc Client
                    channel.socket = socket;
                    socket.on('call', function (data) {
                        var exposed = channel.fns;
                        if (exposed.hasOwnProperty(data.fnName) && typeof exposed[data.fnName] === 'function') {

                            var retVal = exposed[data.fnName].apply(this, data.args);
                            $q.when(retVal).then(function (retVal) {
								if (retVal instanceof Error) {
									// when synchronously returned Error
									socket.emit('error', { Id: data.Id, reason: retVal });
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
                fnNames.push(fn);
            }

            rpcMaster.emit('expose channel', {name: name, fns: fnNames});
            return channel.deferred.promise;
        }
    };
    var nop = angular.noop;
    rpc.onBatchStarts = nop;
    rpc.onBatchEnd = nop;
    rpc.onCall = nop;
    rpc.onEnd = nop;
    return rpc;
}).directive('rpcController', function ($controller, $q, $rpc) {
    return {
		scope: true,
		compile: function compile(tEl, tAttrs) {
			return {
				pre: function (scope, iElement, attr, controller) {
					var ctrlName = attr.rpcController;
					var promise = $rpc.loadChannel(attr.rpcChannel);
					promise.then(function (channel) {
						scope.rpc = channel;
						var ctrl = $controller(ctrlName, {
							$scope: scope
						});
						iElement.children().data('$ngControllerController', ctrl);
					}, function (err) {
						console.error("Cannot instantiate rpc-controller - channel failed to load");
					});
				}
			};
		}
	}

});

angular.module('Moonridge', ['RPC']).factory('$MR', function $MR($rpc, $q, $log) {
    var MRs = {}; //MR can be only one for each backend

    function Moonridge(backendUrl) {
        var self;
        if (MRs[backendUrl]) {
            return MRs[backendUrl];
        } else {
            self = {};
            MRs[backendUrl] = self;
        }

        var models = {};
		$rpc.connect(backendUrl);

        self.getAllModels = function () {
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
            var self = this;
            this._LQs = [];
            self.deferred = $q.defer();
//            this.methods = rpc;
            this.liveQuery = function (qBase, limit, skip, populate) {

				var promise = self.rpc.liveQuery.apply(this, arguments);
				promise.then(function (LQ) {
					self._LQs[LQ.index] = LQ;
					LQ.getDocById = function (id) {
						var i = LQ.docs.length;
						while (i--) {
							if (LQ.docs[i]._id === id) {
								return LQ.docs[i];
							}
						}
						return null;
					};

					LQ.on_create = function (doc) {
						LQ.docs.push(doc);
					};
					LQ.on_update = function (doc, isInResult) {
						var i = LQ.docs.length;
						while (i--) {
							var updated;
							if (LQ.docs[i]._id === doc._id) {
								if (isInResult === false) {
									docs.splice(i, 1);  //removing from docs
									return;
								}
								updated = LQ.docs[i];
								angular.extend(updated, doc);
								return;
							}
						}
						if (isInResult) {
							LQ.docs.push(doc); // pushing into docs if it was not found by loop
							//we don't care about sorting-LQ.docs is a set, sorting is done on client side
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
                    LQ.destroy = function () {
                        self.rpc.unsubLQ(LQ.index);
                        self.docs.length = 0;
                        delete self._LQs[LQ.index];
                    };
					return LQ;
				}, function (err) {
					$log.error(err);
				});
				return promise;
            }
        }

		self.getModel = function (name) {
            var model = models[name];
            if (model) {
                return model.deferred.promise
            } else {
                model = new Model();
                models[name] = model;
            }

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
                server: $rpc.loadChannel('MR-' + name)
            };


            $q.all(promises).then(function (chnlPair) {
                model.rpc = chnlPair.server;
                model.deferred.resolve(model);
            });

			return model.deferred.promise;

		};

        return self;
    }

    return Moonridge;
}).directive('mrController', function ($controller, $q, $MR) {
    return {
        scope: true,
        compile: function compile(tEl, tAttrs) {
            return {
                pre: function (scope, iElement, attr, controller) {
                    var ctrlName = attr.mrController;
                    var url = attr.mrUrl;
                    var MR = $MR(url);
                    MR.getModel(attr.modelName).then(function (model) {
                        scope.model = model;
                        var ctrl = $controller(ctrlName, {
                            $scope: scope
                        });
                        iElement.children().data('$ngControllerController', ctrl);
                    }, function (err) {
						throw new Error("Cannot instantiate mr-controller - error: " + err);
                    });

                }
            };
        }
    }

});