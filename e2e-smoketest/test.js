// testing the controller in e2e-smoketest/mr-test-ctrl.js
describe('testCtrl', function() {
    var MrMock, scope, createController, fighterMock, userMock;

	beforeEach(module('MRTest'));

    beforeEach(inject(function($injector) {
        // Set up the mock http service responses
        MrMock = $injector.get('MoonridgeMock');

        fighterMock = new MrMock({liveQuery: function (params, query) {
            query.resolvePromise([{name: 'Littlefinger', health: 20, _id: '1'}, {_id:'2', name: 'Roose Bolton', health: 35}]);
        }});

        userMock = new MrMock({query: function (params) {
            return {name: 'Admin', _id: '53e87849cd81c40c16221759'};
        }});

        // Get hold of a scope (i.e. the root scope)
        scope = $injector.get('$rootScope');
        // The $controller service is used to create instances of controllers
        var $controller = $injector.get('$controller');

        createController = function() {
			console.log("testCtrl ran");
            return $controller('testCtrl', {'$scope' : scope, fighter: fighterMock, user: userMock });
        };
    }));


    it('should fetch an admin', function() {
        createController();
        expect(scope.admin.doc.name).toBe('Admin');

    });

});