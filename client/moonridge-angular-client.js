angular.module('Moonridge', ['RPC']).factory('$MR', function $MR($rootScope, $rpc, $q, $log) {
    var MRs = {}; //it is possible to have just one instance for each backend

    /**
     *
     * @param {String} name identifying the backend instance
     * @param {Object} params
     * @param {String} params.url backend adress
     * @param {Object} params.hs handshake for socket.io
     * @returns {*}
     * @constructor
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
							}
							updated = LQ.docs[i];
							angular.extend(updated, doc);
							return;
						}
					}
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

    Moonridge.getBackend = function (name) {
        if (MRs[name]) {
            return MRs[name];
        } else {
            throw new Error('no such Moonridge backend');
        }
    };

    return Moonridge;
}).directive('mrController', function ($controller, $q, $MR) {
    return {
        scope: true,
        compile: function compile(tEl, tAttrs) {
            return {
                pre: function (scope, iElement, attr, controller) {
                    var ctrlName = attr.mrController;
                    var backend = attr.mrBackend;
                    //TODO add support for attr.mrModels
                    var MR = $MR.getBackend(backend);
                    MR.getModel(attr.mrModel).then(function (model) {
                        scope.MR = model;	//MR for Moonridge
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