// thx to Leeroy Brun http://stackoverflow.com/a/21254635
angular.module('ngTools').filter('trustAsHtml', ['$sce', function($sce){
	return function(text) {
		return $sce.trustAsHtml(text);
	};
}]).filter('localizeNumber', function() {
	return function (number, lng, opts) {
		if (angular.isFunction(number.toLocaleString)) {
			return number.toLocaleString(lng, opts);
		} else {
			return number;
		}
	}
});