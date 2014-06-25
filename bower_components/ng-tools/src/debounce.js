angular.module('ngTools').factory('debounce', ['$timeout', function ($timeout) {
	/**
	 * will cal fn once after timeout even if more than one call wdo debounced fn was made
	 * @param {Function} fn to call debounced
	 * @param {Number} timeout
	 * @param {boolean} apply will be passed to $timeout as last param, if the debounce is triggering infinite digests, set this to false
	 * @returns {Function} which you can call instead fn as if you were calling fn
	 */
	function debounce(fn, timeout, apply){
		timeout = angular.isUndefined(timeout) ? 0 : timeout;
		apply = angular.isUndefined(apply) ? true : apply; // !!default is true! most suitable to my experience
		var nthCall = 0;
		return function(){ // intercepting fn
			var that = this;
			var argz = arguments;
			nthCall++;
			var later = (function(version){
				return function(){
					if (version === nthCall){
						return fn.apply(that, argz);
					}
				};
			})(nthCall);
			return $timeout(later, timeout, apply);
		};
	}
	return debounce;
}]);