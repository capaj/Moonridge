require('chai').should()
var mrPair = require('./utils/run_server_client')
var mr = mrPair.client
var fightersCreation = require('./utils/create_fighters_and_delete_after')

describe('distinct queries', function() {
	this.timeout(6000)
	var fighterModel
	var LQ

	before(function() {
		fighterModel = mr.model('fighter')
		return fightersCreation.before(fighterModel)
	})

	it('should yield all the distinct values for a field in a database when querying', function() {
		return fighterModel.query().distinct('health').exec().then(function(healths) {
			healths.length.should.eql(3)
			healths[0].should.eql(50)
			healths[1].should.eql(20)
			healths[2].should.eql(10)
		})
	})

	describe('livequerying', function() {


		before(function() {
			LQ = fighterModel.liveQuery().distinct('health').exec()
		})

		it('should yield all the distinct values for a field in a database when liveQuerying', function(done) {
			LQ.on('init', function(params) {
				params.values.length.should.eql(3)
				done()
			})

		})

		describe('when adding', function() {
			var unsub
			it('new entity with a distinct value, this value should be pushed on the client', function(done) {

				unsub = LQ.onAny(function(evName, params) {
					var syncObj = params[1]
					evName.should.equal('distinctSync')
					syncObj.add.should.eql([65])
					syncObj.remove.should.eql([])

					LQ.result.should.eql([50, 20, 10, 65])

					done()
				})
				fighterModel.create({name: 'Littlefinger', health: 65})
			})

			it('should not push a value if it is already contained', function(done) {
				//array should always be a set-no duplicates
				fighterModel.create({name: 'Littlefinger2', health: 65}).then(() => {
					setTimeout(() => {
						LQ.result.should.eql([50, 20, 10, 65])
						unsub()
						done()
					}, 300)
				})
			})
		})

		describe('when removing', function() {
			it('an entity with a distinct value, this value should be spliced on the client', function() {

			})

			it('an entity with a distinct value, this value must NOT be spliced if there is still other document with such value', function() {

			})
		})

		describe('when updating', function() {
			it('an entity with a distinct value, this value should be replaced', function() {

			})

			it('an entity with a distinct value, this value must be added NOT be replaced if there is still other document with such value', function() {

			})
		})

	})

	after(function() {
    return Promise.all([
      fighterModel.query().find().exec().then((fighters) => {
        return fighters.map((f) => {
          return fighterModel.remove(f)
        })
      }),
      fightersCreation.after()
    ])
	})

})
