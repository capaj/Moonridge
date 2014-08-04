// testing the controller in e2e-smoketest/mr-test-ctrl.js
describe('testCtrl', function() {
    var MrMock, $rootScope, createController, fighterMock;

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
            return $controller('testCtrl', {'$scope' : $rootScope, fighter: fighterMock });
        };
    }));


    it('should fetch two fighters', function() {
        var controller = createController();

        expect(controller.basicQuery.length).toBe(2);

    });

});