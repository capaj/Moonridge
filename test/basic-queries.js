require('chai').should();

var cp = require('child_process');

var n = cp.fork('./e2e-smoketest/server.js');

var $MR = require('../client/moonridge-node');
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
		this.timeout(10000);
		MRB.getModel('fighter').then(function(model) {
			fighter = model;
			done();
		});
	});

	it('should allow to create an entity of a model',function(done){
		this.timeout(10000);

		fighter.create({name: 'Arya', health: 50}).then(function(created){
			created.should.have.property('_id');
			fighterId = created._id;
			done();
		});

	});

	it('should allow to query model', function(done){
		this.timeout(10000);

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
		this.timeout(5000);

	});

	it('should be able to update an entity of a model', function(done){
		fighterEntity.health += 10;
		fighter.update(fighterEntity).then(function() {
			done();
		});
	});

	after(function(done) {
		console.log("_id", fighterId);
		fighter.remove({_id: fighterId}).then(done);
	});


	//
	//it('should be able to delete an entity of a model', function(){
	//    ;
	//});

});