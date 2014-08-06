angular.module('Moonridge').factory('MoonridgeMock', function ($q, $log, QueryChainable) {

	var immediatePromise = function(res) {
		var dfd = $q.defer();
		dfd.resolve(res);
		return dfd.promise;
	};

    var MoonridgeMock = function MoonridgeMock(callDefs) {
        this.callDefs = callDefs;
        this.docArray = [];
		this.queryChainable =  function () {
			var master = {query:[], indexedByMethods: {}};
			new QueryChainable(master, function () {
				return callDefs(master.query);
			}, {});
			return queryChainable;
		};
    };

    MoonridgeMock.prototype = {
        query: queryFluentBuilder,
        liveQuery: queryFluentBuilder,
		create: function(obj) {
			this.docArray.push(obj);
			return immediatePromise(obj);
		},
		remove: function(obj) {
			//TODO implement
		},
		update: function(obj) {
			//TODO implement
		},
		listPaths: function(obj) {
			//TODO implement
		}
    };

    return MoonridgeMock;
});