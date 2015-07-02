var mrPair = require('./run_server_client');
var mr = mrPair.client;
var all;
var locationsModel;

module.exports = {
	before:  function(model) {
		locationsModel = model;
		return mr.authorize({nick: 'admin'}).then(function() {
			all = Promise.all([
				locationsModel.create({loc: [1, 2]}),
				locationsModel.create({loc: [2, 3]}),
				locationsModel.create({loc: [5, 3]})
			]);
			return all;
		});
	},
	after: function() {
		return all.then(function(locations){
			return Promise.all(locations.map(locationsModel.remove));
		});
	}

};