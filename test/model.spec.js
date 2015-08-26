var mongoose = require('mongoose');

describe('Moonridge model', function() {
	it('should run schemaInit on registering a new model', function() {
		var fighter = MR.model('fighter', {
			name: String
		}, {
			schemaInit: function(schema) {
				expect(schema.name).to.equal('fighter');
			}

		});
	});
});