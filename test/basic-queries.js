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
		console.log("Ha disconnected!");
	});
});

dfd.resolve({url: 'http://localhost:8080'});

describe("basic CRUD",function(){
	this.timeout(15000);

	var fighter;
	var fighterEntity;
	var fighterId;
	var LQ;
	before(function(done) {
		MRB.auth({nick: 'admin'}).then(function(user){ //user === moonridgeBackend.user
			console.log("user", user);
			done();
		});
	});

	beforeEach(function(done) {
		MRB.getModel('fighter').then(function(model) {
			fighter = model;
			done();
		});
	});

	it('should allow to create an entity of a model',function(done){
		fighter.create({name: 'Arya', health: 50}).then(function(created){
			created.should.have.property('_id');
			fighterId = created._id;
			done();
		});

	});

	it('should allow to query model', function(done){

		LQ = fighter.liveQuery().sort('health').exec();
		LQ.on('any', function(evName, params) {
			if (evName === 'init') {
				params.docs.length.should.equal(1);
				fighterEntity = params.docs[0];
				done();
				LQ.stop();

			} else {
				throw new Error('was expecting an init event only');
			}
		});

	});

	it('should be able to update an entity of a model', function(done){
		fighterEntity.health += 10;
		fighter.update(fighterEntity).then(function() {
			done();
		});
	});

	after(function(done) {
		console.log("_id", fighterId);
		var finish = function() {
			server.kill();
			done();
		};
		fighter.remove({_id: fighterId}).then(function() {
			setTimeout(finish, 1000);
		});

	});


	it('should be able to delete an entity of a model', function(){
	    //TODO implement
	});

});