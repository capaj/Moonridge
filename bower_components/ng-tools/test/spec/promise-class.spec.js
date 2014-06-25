describe('promiseClass directive', function() {
	var elm, scope;

	// load the tabs code
	beforeEach(module('ngTools'));


	beforeEach(inject(function($rootScope, $compile) {
		// we might move this tpl into an html file as well...
		elm = angular.element('<h1 promise-class="prom"></h1>');

		scope = $rootScope;
		$compile(elm)(scope);
		scope.$digest();
	}));


	it('should set not-initialized class on the element', function() {
		expect(elm).toHaveClass('not-initialized');
		expect(elm).not.toHaveClass('resolved');
	});

	describe('promise states', function () {
		var def;

		beforeEach(inject(function ($q) {
			def = $q.defer();
			scope.prom = def.promise;
		}));

		it('should set in-progress class on the element when promise is set to scope', inject(function ($q) {

			scope.$digest();
			expect(elm).toHaveClass('in-progress');

		}));

		it('should set resolved class on the element when promise is set to scope and resolved', inject(function ($q) {
			def.resolve();
			scope.$digest();
			expect(elm).toHaveClass('resolved');

		}));

		it('should set rejected class on the element when promise is set to scope and rejected', inject(function ($q) {
			def.reject();
			scope.$digest();
			expect(elm).toHaveClass('rejected');

		}));
	});


});

