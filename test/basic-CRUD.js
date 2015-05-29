require('chai').should();

var cp = require('child_process');

var server = cp.fork('./test/e2e-smoketest/server.js');

var $MR = require('../Moonridge-client/moonridge-client');

//Moonridge backend
var mr = $MR({url: 'http://localhost:8080', hs: {nick: 'admin'}});
mr.connectPromise.then(function(socket) {
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
	before(function(done) {
		setTimeout(function(){
			fighterModel = mr.model('fighter');
			done();
		}, 2000);
	});

	it.only('should allow to query model', function(done){

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

	it('should be able to send a different handshake and be authenticated again', function (){

	});

	after(function(done) {
		console.log("_id", fighterId);
		server.kill();
		done();
	});




});