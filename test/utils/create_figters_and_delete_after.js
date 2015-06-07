var mrPair = require('./run_server_client');
var mr = mrPair.client;
var all;
var fighterModel;

module.exports = {
	before:  function(model) {
		fighterModel = model;
		return mr.authorize('admin').then(function() {
			all = Promise.all([
				fighterModel.create({name: 'Arya', health: 50}),
				fighterModel.create({name: 'Bran', health: 20}),
				fighterModel.create({name: 'Rickon', health: 10})
      ]);
      return all;
		});
	},
	after: function() {
		return all.then(function(fighters){
			return Promise.all(fighters.map(fighterModel.remove));
		});
	}

};