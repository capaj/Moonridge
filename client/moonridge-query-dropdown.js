angular.module('Moonridge').directive('mrQueryDropdown', function () {
    return {
        restrict: 'EA',
        templateUrl: 'moonridge_query_dropdown.html',
        link: function (scope, elem, attrs) {
            var modelName;
            var LQScopeProp = attrs.query;
            scope.guiPathTexts = scope.$eval(attrs.guiPathTexts);

            scope.$watch(LQScopeProp, function (query) {
                if (query && query._model && query._model.rpc){
                    if (modelName !== query._model.name) {
                        modelName = query._model.name;
                        query._model.rpc.listPaths().then(function (paths) {
                            console.log("mrQueryDropdown", paths);
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
                            console.log(sortPath, ev);
                            scope[LQScopeProp].stop();

                            if (ev.shiftKey) {
                                //append sort path to existing
                            } else {
                                var newLQ = query._model.liveQuery(query);
                                scope[LQScopeProp] = newLQ.sort(sortPath).exec();

                            }
                        }
                    }

                }
            });

        }
    }
});