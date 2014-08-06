// testing the controller in e2e-smoketest/mr-test-ctrl.js
describe('testCtrl', function() {
    var MrMock, $rootScope, createController, fighterMock;

	beforeEach(module('MRTest'));

    beforeEach(inject(function($injector) {
        // Set up the mock http service responses
        MrMock = $injector.get('MoonridgeMock');

        fighterMock = new MrMock({query: function (params, pr) {
            pr.resolve([{name: 'Littlefinger', health: 20}, {name: 'Roose Bolton', health: 35}]);
        }});

        // Get hold of a scope (i.e. the root scope)
        $rootScope = $injector.get('$rootScope');
        // The $controller service is used to create instances of controllers
        var $controller = $injector.get('$controller');

        createController = function() {
			console.log("createController");
            return $controller('testCtrl', {'$scope' : $rootScope, fighter: fighterMock, user: new MrMock() });
        };
    }));


    it('should fetch two fighters', function(done) {
        var controller = createController();
		setTimeout(function() {
			expect(controller.basicQuery.length).toBe(2);
			done();
		},2);

    });

});