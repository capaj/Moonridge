angular.module('Moonridge', []).factory('$MR', function $MR($rpc, storage, $q, $log) {

    function Moonridge(backendUrl) {
        var self = this;

        var models = {};
		$rpc.connect('http:'+ backendUrl);

        this.getAllModels = function () {
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

//            this.methods = rpc;
            this.liveQuery = function (qBase, limit, skip, populate) {
                return rpc.liveQuery.apply(this, arguments).then(function (LQ) {
                    self._LQs[LQ.index] = LQ;
                    LQ.getDocById = function (id) {
                        var i = LQ.docs.length;
                        while(i--){
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
                        while(i--){
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
                        while(i--){
                            if (LQ.docs[i]._id === doc._id) {
                                delete LQ.docs[i];
                            }
                        }
                    };
                    return LQ;
                });
            }
        }

		this.getModel = function (name) {
            var model = models[name];
            if (model) {
                return model.deferred.promise
            } else {
                model = new Model();
                models[name] = model;
            }

            models[name] = {deferred: $q.defer()};

            var promises = {
                client: $rpc.expose('MR-' + name, {
                    pub: function (doc, eventName, LQId, isInResult) {
                        if (LQId) {
                            //updateLQ
                            model._LQs[LQId]['on_' + eventName](doc, isInResult);

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

        return this;
    }

    return Moonridge;
});