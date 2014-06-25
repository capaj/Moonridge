// use on any element that has some A tags as children
angular.module('ngTools').directive('markCurrentLinks', function () {
    return {
        priority: 50,
        link: function (scope, el, attrs) {
            scope.$on('$locationChangeSuccess', function (ev, newUrl) {
                var links = el.find('a');
                var i = links.length;
                while(i--) {
                    var link = angular.element(links[i]);
                    var index = newUrl.indexOf(link.attr('href'));
                    if (index !== -1) {
                        link.addClass('current');
                    } else {
                        link.removeClass('current');
                    }
                }
            });
        }
    }
}).directive('markCurrentIfAnyChildIs', ['$timeout', function ($timeout) {
    return {
        link: function (scope, el, attrs) {
            scope.$on('$locationChangeSuccess', function (ev, newUrl) {
                $timeout(function () {
                    var links = el.find('a');
                    var i = links.length;
                    while(i--) {
                        var link = angular.element(links[i]);
                        if (link.hasClass('current')) {
                            el.addClass('current');
                            return;
                        }
                    }
                    // executed only if no link has 'current' class
                    el.removeClass('current');
                });
            });
        }
    }
}]);