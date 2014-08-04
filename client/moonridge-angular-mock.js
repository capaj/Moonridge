angular.module('Moonridge').factory('MoonridgeMock', function ($q, $log) {
    var queryFluentBuilder = function () {

    };

    var MoonridgeMock = function MoonridgeMock(callDefs) {
        this.callDefs = callDefs;
    };

    MoonridgeMock.prototype = {
        query: queryFluentBuilder,
        liveQuery: queryFluentBuilder
    };

    return MoonridgeMock;
});