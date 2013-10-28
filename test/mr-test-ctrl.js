angular.module('mrTest', []).controller('mrTestCtrl', function ($scope, $MR) {
    $MR.connect('localhost:8080');
//    $MR.models
});