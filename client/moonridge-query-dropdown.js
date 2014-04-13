angular.module('Moonridge').directive('mrQueryDropdown', function () {
    return {
        restrict: 'EA',
        templateUrl: 'moonridge_query_dropdown.html',
        scope: {
            query: '=',
            guiPathTexts: '='   //Array<String> or hashobject acceptable here
        },
        link: function (scope) {
            scope.$watch('query', function (query) {
                if (query && query._model && query._model.rpc){
                    query._model.rpc.listPaths().then(function (paths) {
                        console.log("mrQueryDropdown", paths);
                        scope.paths = paths;
                    })
                }
            });

        }
    }
});