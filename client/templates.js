angular.module('Moonridge').run(['$templateCache', function($templateCache) {
  'use strict';

  $templateCache.put('moonridge_query_dropdown.html',
    "<div class=\"moonridge-query-dropdown btn-group\">\r" +
    "\n" +
    "    <a class=\"btn btn-default dropdown-toggle\" data-toggle=\"dropdown\">\r" +
    "\n" +
    "        Sort and filter <span class=\"caret\"></span>\r" +
    "\n" +
    "    </a>\r" +
    "\n" +
    "    <ul class=\"dropdown-menu\" role=\"menu\">\r" +
    "\n" +
    "        <li ng-repeat=\"path in paths\">\r" +
    "\n" +
    "            <div class=\"row\" ng-if=\"guiPathTexts[$index] !== false\">\r" +
    "\n" +
    "                <div class=\"col-md-4\">\r" +
    "\n" +
    "                    <span ng-class=\"{active: getSortTokens().indexOf('-' + path) !== -1}\"\r" +
    "\n" +
    "                            class=\"glyphicon glyphicon-sort-by-attributes-alt\" ng-click=\"sortBy('-' + path, $event)\"></span>\r" +
    "\n" +
    "                    <span ng-class=\"{active: getSortTokens().indexOf(path) !== -1}\"\r" +
    "\n" +
    "                            class=\"glyphicon glyphicon-sort-by-attributes\" ng-click=\"sortBy(path, $event)\"></span>\r" +
    "\n" +
    "                </div>\r" +
    "\n" +
    "                <div class=\"col-md-8\">\r" +
    "\n" +
    "                    <a ng-bind=\"guiPathTexts[$index] || path\" ng-click=\"switchSort(path)\"></a>\r" +
    "\n" +
    "                </div>\r" +
    "\n" +
    "            </div>\r" +
    "\n" +
    "        </li>\r" +
    "\n" +
    "    </ul>\r" +
    "\n" +
    "</div>"
  );

}]);
