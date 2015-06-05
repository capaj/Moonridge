var mrPair = require('./run_server_client');

describe('distinct queries', function() {
	it('should yield all the distinct values for a field in a database', function() {

	});

	describe('livequerying', function() {


		describe('when adding', function() {
			it('new entity with a distinct value, this value should be pushed on the client', function() {

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


});