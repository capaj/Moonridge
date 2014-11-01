require('styles/moonridge-query-dropdown.css!');

angular.module('Moonridge').directive('mrQueryDropdown', function ($log) {
    return {
        restrict: 'EA',
        template: require('templates/moonridge_query_dropdown.html!text'),
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
});