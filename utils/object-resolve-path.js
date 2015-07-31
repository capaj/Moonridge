module.exports = function resolve(obj, path) {
	if (typeof path !== 'string') {
		console.log('path', path);
		throw new TypeError('path must be a string');
	}
	return path.split('.').reduce(function(prev, curr) {
		return prev[curr];
	}, obj || this);
};