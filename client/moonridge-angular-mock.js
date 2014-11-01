var QueryChainable = require('./moonridge/query-chainable');

angular.module('Moonridge').factory('MoonridgeMock', function ($q, $log) {

	var immediatePromise = function(res, success) {
		var dfd = $q.defer();
        if (success === false) {
            dfd.reject(res);
        } else {
            dfd.resolve(res);
        }
		return dfd.promise;
	};

    var makeQueryResult = function (res) {
        var result = {promise: immediatePromise(res), on: angular.noop};
        if (Array.isArray(res)) {
            result.docs = res;
        } else {
            result.doc = res;
        }
        return result;
    };

    var MoonridgeMock = function MoonridgeMock(callDefs) {
        this.callDefs = callDefs;
        this.docArray = [];
        var self = this;
        /**
         *
         * @param {String} type
         * @returns {QueryChainable}
         */
		var queryChainable =  function (type) {
			var master = {query:[], indexedByMethods: {}};

			return new QueryChainable(master, function () {
                if (callDefs[type]) {
                    var query = {
                        resolvePromise: function (res) {
                            query.promise = immediatePromise(res);
                            if (Array.isArray(res)) {
                                query.docs = res;
                            } else {
                                query.doc = res;
                            }
                        }, on: angular.noop
                    };
                    var fakeResult = callDefs[type](master, query);
                    if (fakeResult) {
                        query.resolvePromise(fakeResult);
                    }
                    return query;
                } else {
                    if (master.indexedByMethods.findOne) {
                        return makeQueryResult({});
                    } else {
                        return makeQueryResult([]);
                    }
                }
            }, {});
		};

        angular.extend(this, {
            query: function () {
                return queryChainable('query');
            },
            liveQuery: function () {
                return queryChainable('liveQuery');
            },
            create: function(obj) {
                self.docArray.push(obj);
                return immediatePromise(obj);
            },
            remove: function(obj) {
                //TODO implement
                self.docArray.splice(this.docArray.indexOf(obj), 1);
                return immediatePromise(obj);

            },
            update: function(obj) {
                var updated = self.docArray.filter(function (doc) {
                    return doc._id === obj._id;
                });
                if (updated[0]) {
                    angular.extend(updated[0], obj);
                    return immediatePromise(updated[0]);
                } else {
                    return immediatePromise(new Error('document not found'), false);
                }
            },
            listPaths: function() {
                //TODO implement
                return immediatePromise(['_id']);
            }
        })
    };

    return MoonridgeMock;
});