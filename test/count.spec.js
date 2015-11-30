require('chai').should()
var mrPair = require('./utils/run_server_client')
var mr = mrPair.client

var fightersCreation = require('./utils/create_fighters_and_delete_after')

describe('count queries', function() {
	this.timeout(5000)
	var fighterModel
	var LQ

	before(function() {
		fighterModel = mr.model('fighter')
		return fightersCreation.before(fighterModel)
	})

	it('should be able to live query the count of documents', function() {
		LQ = fighterModel.liveQuery().count().exec()
		LQ.promise.then(function(resLQ) {
			LQ.result.should.eql(3)
			return Promise.all([
				fighterModel.create({name: 'Varys', health: 40}),
				fighterModel.create({name: 'Tyrion', health: 35})
			]).then(function(fighters){
				LQ.result.should.eql(5)
				return Promise.all(fighters.map(fighterModel.remove))
			})
		})
		return LQ.promise
	})

	it('should be able to query the count of documents', function(){
		return fighterModel.query().count().exec().promise.then(function(res) {
			res.should.eql(3)
		})
	})

	after(function() {
		return fightersCreation.after()
	})

})
