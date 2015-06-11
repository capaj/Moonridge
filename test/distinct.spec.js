require('chai').should();
var mrPair = require('./utils/run_server_client');
var mr = mrPair.client;
var fightersCreation = require('./utils/create_figters_and_delete_after');

describe('distinct queries', function() {
	this.timeout(7000);
	var fighterModel;
	var LQ;

	before(function() {
		fighterModel = mr.model('fighter');
		return fightersCreation.before(fighterModel);
	});

	it('should yield all the distinct values for a field in a database when querying', function() {
		return fighterModel.query().distinct('health').exec().promise.then(function(healths) {
			healths.length.should.eql(3);
			healths[0].should.eql(50);
			healths[1].should.eql(20);
			healths[2].should.eql(10);
		});
	});

	describe('livequerying', function() {


		before(function() {
			LQ = fighterModel.liveQuery().distinct('health').exec();
		});

		it('should yield all the distinct values for a field in a database when liveQuerying', function(done) {
			LQ.on('init', function(evName, params) {
				console.log("params", params, evName);

				params.values.length.should.eql(3);
				done();
			});

		});

		describe('when adding', function() {
			it('new entity with a distinct value, this value should be pushed on the client', function(done) {

				var unsub = LQ.on('any', function(evName, params) {
					var syncObj = params[1];
					evName.should.equal('distinctSync');
					console.log("on any", LQ.values, params);
					syncObj.add.should.eql([65]);
					syncObj.remove.should.eql([]);

					LQ.values.should.eql([50, 20, 10, 65]);
					unsub();
					done();

				});

				fighterModel.create({name: 'Littlefinger', health: 65});

			});

			it('should not push a value if it is already contained', function() {
				//array should always be a set-no duplicates
			});
		});

		describe('when removing', function() {
			it('an entity with a distinct value, this value should be spliced on the client', function() {

			});

			it('an entity with a distinct value, this value must NOT be spliced if there is still other document with such value', function() {

			});
		});

		describe('when updating', function() {
			it('an entity with a distinct value, this value should be replaced', function() {

			});

			it('an entity with a distinct value, this value must be added NOT be replaced if there is still other document with such value', function() {

			});
		});

	});

	after(function() {
		return fightersCreation.after();
	});

});