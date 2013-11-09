var counter = 0;
var now;

setInterval(function () {
	now = new Date();
	counter = 0;
},1);

module.exports = function () {
	counter += 1;
	return JSON.stringify(now) + '|' + counter;
};