var Moonridge = require('../moonridge');
var locals = require('./e2e-smoketest/localVariables.json');
var MR = Moonridge(locals.connString);
var expect = require('chai').expect;
var server = MR.bootstrap(8079);
describe('Moonridge model', function() {
	it('should run schemaInit on registering a new model', function(done) {
		var fighter = MR.model('sample_model', {
			name: String
		}, {
			schemaInit: function(schema) {
				expect(schema.pathType('name')).to.eql('real');
				done();
			}

		});
	});
});