angular.module('Moonridge').factory('MoonridgeMock', function ($q, $log, QueryChainable) {
    var queryFluentBuilder = function () {
        var master = {query:[], indexedByMethods: {}};
        var queryChainable = new QueryChainable(master, function () {
            return model.rpc.query(master.query);
        }, model);

        return queryChainable;
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