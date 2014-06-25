angular.module('ngTools').factory('urlize', ['$location', '$route', '$log', '$timeout',
    function ($location, $route, $log, $timeout) {

        var setScopeProp = true;

        /**
         *
         * @param {Object} scope
         * @param {String} prop on scope, should be an object or undefined, if undefined, will be set to new Object
         * @param {Boolean} asJson allows for more than one url synchronized objects
         */
        function urlize(scope, prop, asJson) {
            if ($route.current) {
                if ($route.current.$$route.reloadOnSearch !== false) {
                    throw new Error('Current route reloads on search, reloadOnSearch should be set to false');
                }
            } else {
                throw new Error('Urlize has to be used on route controller with reloadOnSearch set to false');
            }

            if (!scope[prop]) {
                scope[prop] = {};
            }

            var updateFromLocation;
            if (asJson) {
                updateFromLocation = function () {
                    if (setScopeProp) {
                        var inLoc = $location.search()[prop];
                        if (inLoc) {
                            debugger;
                            if (!angular.isObject(inLoc)) {
                                inLoc = JSON.parse(inLoc);
                            }
                            scope[prop] = inLoc;
                        }
                    }

                };
            } else {
                updateFromLocation = function () {
                    debugger;
                    if (setScopeProp) {
                        var search = $location.search();
                        angular.extend(scope[prop], search);
                    }

                }
            }

            updateFromLocation();

            if (asJson) {
                scope.$watch(prop, function (nV, oV) {
                    if (nV) {
                        if (angular.isObject(nV)) {
                            nV = JSON.stringify(nV);
                        }
                        setScopeProp = false;
                        $location.search(prop, nV);
                        $timeout(function () {
                            setScopeProp = true;
                        });
                    }
                }, true);
            } else {
                scope.$watch(prop, function (nV, oV) {
                    if (nV) {
                        if (angular.isObject(nV)) {
                            setScopeProp = false;
                            $location.search(nV);

                            $timeout(function () {
                                setScopeProp = true;
                            });
                        }
                    }
                }, true);
            }

            scope.$on('$routeUpdate', updateFromLocation);
        }

        return urlize;
    }]);