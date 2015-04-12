require('chai').should();

var cp = require('child_process');

var server = cp.fork('./test/e2e-smoketest/server.js');

var $MR = require('moonridge-client');
var Promise = require('bluebird');

var dfd = Promise.defer();

//Moonridge backend
var MRB = $MR('local', dfd.promise, true);  //true indicates, that this backend should be used by default
MRB.connectPromise.then(function(socket) {
	//you can hook up more events here
	socket.on('disconnect', function() {
		throw new Error('Disconnection should not occurr.');
	});
});

describe("basic CRUD including working liveQueries",function(){
	this.timeout(10000);

	var fighterModel;
	var fighterEntity;
	var fighterId;
	var LQ;
	dfd.resolve({url: 'http://localhost:8080'});
	before(function(done) {
		MRB.auth({nick: 'admin'}).then(function(user){ //user === moonridgeBackend.user
			console.log("user", user);
			MRB.getModel('fighter').then(function(model) {
				fighterModel = model;
				done();
			});
		});
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

	it('should allow to create an entity of a model',function(done){
		LQ.on('any', function (evName, params){
			evName.should.be.equal('create');
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
		fighterModel.update({_id: 'fakeID'}).then(function() {
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
		server.kill();
		done();
	});




});