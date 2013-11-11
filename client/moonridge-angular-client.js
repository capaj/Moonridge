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
									docs.splice(i, 1);
									return;
								}
								updated = LQ.docs[i];
								angular.extend(updated, doc);
								return;
							}
						}
						if (isInResult) {
							LQ.docs.push(doc);
							//TODO solve sorting and other problems
							return;
						}
						$log.error('Failed to find updated document.');
					};
					LQ.on_remove = function (doc) {
						var i = LQ.docs.length;
						while (i--) {
							if (LQ.docs[i]._id === doc._id) {
								delete LQ.docs[i];
							}
						}
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
                        console.dir(arguments);
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
                        console.error("Cannot instantiate mr-controller - error: " + err);
                    });

                }
            };
        }
    }

});