var forbidden = ['mongooseCollection', '_collection'];
module.exports = function (query) {
	var copy = {};
	for (var prop in query) {
		if (forbidden.indexOf(prop) === -1) {
			copy[prop] = query[prop];
		}
	}
	return JSON.stringify(copy);
};