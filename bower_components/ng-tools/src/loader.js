/**
 * just very simple directive for managing loader element
 */
angular.module('ngTools').service('loaderSvc',['$q', function ($q) {
    this.deferred = $q.defer(); //when loading is finished, just resolve the deferred to fadeOut the element
}]).directive('loader',
    ['loaderSvc',function(loaderSvc) {
        return {
            restrict: 'A',
            link: function (scope, el, attrs) {
                loaderSvc.deferred.promise.then(function () {
                    if (angular.isFunction(loaderSvc.hideMethod)) {
                        loaderSvc.hideMethod(el);
                    } else {
                        el.fadeOut();
                    }
                })
            }
        };
    }]
);