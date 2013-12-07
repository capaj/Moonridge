angular.module('Moonridge', ['RPC']).factory('$MR', function $MR($rootScope, $rpc, $q, $log) {
    var MRs = {}; //stores instances of Moonridge

	var qMethodsEnum = [	//query methods which modifies the collection are not included, those have to be called via RPC methods
		'all',
		'and',
		'box',
		'center',
		'centerSphere',
		'circle',
		'comment',
//	'count',		//must be done in server memory, TODO implement this
//	'distinct',		//must be done in server memory, TODO implement this
		'elemMatch',
		'equals',
		'exists',
		'find',
		'findOne',
		'geometry',
		'gt',
		'gte',
		'hint',
		'in',
		'intersects',
		'lean',
		'limit', //is not sent to the DB, skipping and limiting is done in memory because it would be a problem for liveQueries
		'lt',
		'lte',
		'maxDistance',
		'maxScan',
		'mod',
		'ne',
		'near',
		'nearSphere',
		'nin',
		'nor',
		'or',
		'polygon',
		'populate',
		'read',
		'regex',
		'select',
		'size',
		'skip',	//is not sent to the DB, skipping and limiting is done in memory because it would be a problem for liveQueries
		'slice',
		'sort',
		'where',
		'within'
	];

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
						if (LQ.query.count) {
							LQ.count = res.count;
						} else {
							LQ.docs = res.docs;
						}

						return LQ;	//
					}, function (err) {
						$log.error(err);
					});
				};

				LQ._waitingOnFirstResponse = true;
				LQ.promise = model.rpc.liveQuery(query);


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
					if (LQ.query.count) {
						LQ.count += 1; // when this is a count query, just increment and call it a day
						return;
 					}
					if (angular.isNumber(index)) {
						LQ.docs.splice(index, 0, doc);
					} else {
						LQ.docs.push(doc);
					}
				};
				LQ.on_push = LQ.on_create;
				LQ.on_update = function (doc, isInResult) {
//					console.log("index sent: " + isInResult);
					if (LQ.query.count) {	// when this is a count query
						if (angular.isNumber(isInResult)) {
							LQ.count += 1;
						} else {
							LQ.count -= 1;
						}
						return;// just increment/decrement and call it a day
					}
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
					if (LQ.query.count) {
						LQ.count -= 1;	// when this is a count query, just decrement and call it a day
						return;
					}
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

            model.update = function (toUpdate) {
                delete toUpdate.__v;
                return model.rpc.update(toUpdate);
            };

            model.create = function (toCreate) {
                return model.rpc.create(toCreate);
            };

            model.remove = function (toRemove) {
                return model.rpc.remove(toRemove._id);
            };

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