var Moonridge = require('../moonridge');
var locals = require('./e2e-smoketest/localVariables.json');
var MR = Moonridge(locals.connString);
var expect = require('chai').expect;
var server;

describe('Moonridge model', function() {
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
		var id;

		var fakeSocket = {id:'testSocketId', registeredLQs: {}, moonridge:{user:{}}, rpc: function(method) {
			return function() {
				console.log("rpc Call on ", method, arguments);
				c++;
				if (c === 3) {
					expect(arguments[1]).to.equal(id.toString());
				}
			}
		}};
		LQ = sampleModel.liveQuery.call(fakeSocket, [], 1);


		sampleModel.model.create({name: 'test'}).then(function(created) {
			id = created._id.valueOf();

			sampleModel.schema.on('remove', function(doc) {
				expect(doc).to.equal(id);
				setTimeout(function(){
					expect(c).to.equal(3);
					done();
				}, 100);
			});


			sampleModel.schema.on('update', function(doc) {
				expect(doc).to.equal(id);
				setTimeout(function(){
					sampleModel.findByIdAndRemove(id);
					expect(c).to.equal(2);
				}, 100);
			});

			sampleModel.findByIdAndUpdate(id, {name: 'test2'});
		}, function(err) {
			throw err;
		});


	});
});