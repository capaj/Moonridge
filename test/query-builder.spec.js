var builder = require('../query-builder')
var mongoose = require('mongoose')
var catModel = mongoose.model('Cat', {name: String})


describe('query-builder', function() {
	it('should remove count for live queries', function() {	//because we do counts from docs.length to minimize possible queries that need to live in server memory
		var query = builder(catModel, [{mN: 'count', args: []}], true)
		query.mQuery.op.should.equal('find')
	})

	it('should leave count in for normal queries', function() {
		var query = builder(catModel, [{mN: 'count', args: []}])
		query.mQuery.op.should.equal('count')
	})

	it('should throw an error when sorting and counting in one query', function() {
		try {
			var query = builder(catModel, [{mN: 'count', args: []}, {mN: 'sort', args: ['name']}])
		} catch (err) {
			err.message.should.equal('Mongoose does not support sort and count in one query')
		}
	})

	it('should always be lean', function(){	//for better performance
		var query = builder(catModel, [{mN: 'find', args: []}])
		query.mQuery._mongooseOptions.lean.should.equal(true)
	})
})
