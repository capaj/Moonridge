require('chai').should();
var mrPair = require('./utils/run_server_client');
var mr = mrPair.client;

describe('count queries', function() {
	this.timeout(5000);
	var fighterModel;
	var LQ;

	before(function() {
		fighterModel = mr.model('fighter');
	});

	it('should be able to live query the count of documents', function() {
		return fighterModel.liveQuery().count().exec().promise.then(function(LQ){
			LQ.count.should.eql(0);
		});
	});
});