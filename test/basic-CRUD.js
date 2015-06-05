require('chai').should();

var mrPair = require('./utils/run_server_client');
var mr = mrPair.client;

describe("basic CRUD including working liveQueries",function(){
	this.timeout(10000);

	var fighterModel;
	var fighterEntity;
	var fighterId;
	var LQ;
	before(function() {
		fighterModel = mr.model('fighter');
	});

	it('should allow to query model', function(done){
		LQ = fighterModel.liveQuery().sort('health').exec();
		var subId = LQ.on('init', function(evName, params) {
			if (evName === 'init') {
				console.log("params", params);

				params.docs.length.should.equal(0);
				done();

			} else {
				throw new Error('was expecting an init event only');
			}
		});

	});

	it('should be able to call authorize and be authenticated with a new user', function (){
		return mr.authorize('admin').then(function(user) {
			mr.user.privilige_level.should.equal(50);
		});
	});

	it('should allow to create an entity of a model',function(done){
		LQ.on('any', function (evName, params){
			evName.should.be.equal('add');
			fighterEntity = params[1];
			fighterEntity.name.should.equal('Arya');
			LQ.stop();
			done();
		});

		fighterModel.create({name: 'Arya', health: 50, isNew: false}).then(function(created){
			created.should.have.property('_id');
			created.should.not.have.property('isNew');	//this is reserved by Mongoose
			created.health.should.equal(50);
			fighterId = created._id;
		});

	});

	it('should be able to update an entity of a model', function(done){
		fighterEntity.health += 10;
		fighterModel.update(fighterEntity).then(function() {
			done();
		});
	});

	it('should fail when we try to update nonexistent entity', function(done){
		fighterEntity.health += 10;
		var fakeId = 'fake6c5c6983ef1828ec7af4';
		fighterModel.update({_id: fakeId}).then(function() {
			throw 'Entity should not have been updated';
		}, function (err){
			done();
		});
	});

	it('should be able to delete an entity of a model', function(done){
		fighterModel.remove({_id: fighterId}).then(function(){
		    done()
		}, function (err){
		    throw err;
		});
	});

	after(function(done) {
		console.log("_id", fighterId);
		mrPair.server.kill();
		done();
	});


});