var Moonridge = require('../moonridge');
var locals = require('./e2e-smoketest/localVariables.json');
var MR = Moonridge(locals.connString);
var expect = require('chai').expect;
var server;

describe.only('Moonridge model', function() {
	var LQ;
	var sampleModel;

	it('should run schemaInit on registering a new model', function(done) {
		sampleModel = MR.model('sample_model', {
			name: String
		}, {
			schemaInit: function(schema) {
				expect(schema.pathType('name')).to.eql('real');
				done();
			}

		});

		server = MR.bootstrap(8079);
	});

	it('should trigger schema events even when utilising findByIdAnd... methods on moonridge model directly', function(done){
		//normally mongoose would not trigger those-they are only triggered when doing doc.save().
		// We need to have them triggered in order for liveQueries to work
		var c = 0;
		var fakeSocket = {moonridge:{user:{}}, rpc: function() {
			return function() {
				console.log("rpc Call", arguments);
				c++;
			}
		}};
		LQ = sampleModel.liveQuery.call(fakeSocket, [], 0);

		//sampleModel.liveQueries["[]"]

		sampleModel.model.create({name: 'test'}).then(function(created) {
			var id = created._id.valueOf();

			sampleModel.schema.on('remove', function(doc) {
				expect(doc).to.equal(id);
				setTimeout(function(){
					expect(c).to.equal(2);
					done();
				}, 100);
			});


			sampleModel.schema.on('update', function(doc) {
				expect(doc).to.equal(id);
				sampleModel.findByIdAndRemove(id);
			});

      sampleModel.findByIdAndUpdate(id, {name: 'test2'});
		}, function(err) {
			throw err;
		});


	});
});