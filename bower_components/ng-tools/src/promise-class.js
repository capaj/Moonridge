angular.module('ngTools').value('promiseClassStates',
	['not-initialized', 'in-progress', 'resolved', 'rejected'])
.directive('promiseClass', function (promiseClassStates) {
	return {
		restrict: 'A',
		link: function (scope, el, attrs) {
			var states = promiseClassStates;

			var inProgress = function (prom) {
				el.removeClass(states[0]);
				el.addClass(states[1]);
				prom.then(function () {
					el.removeClass(states[1]);
					el.addClass(states[2]);
				}, function () {
					el.removeClass(states[1]);
					el.addClass(states[3]);
				});
			};

			scope.$watch(function () {
				return scope.$eval(attrs.promiseClass);
			}, function (nV) {
				if(nV && nV.then) {
					inProgress(nV);
				} else {
					el.addClass(states[0]);
				}
			});

		}
	};
});