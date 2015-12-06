/* eslint-env node, mocha */
require('chai').should()
var mrPair = require('./utils/run_server_client')
var mr = mrPair.client
require('./utils/create_locations_and_delete_after')

describe('set operations', function () {
  //while update works great for assigning values/merging objects it
  this.timeout(4000)
  var fighterModel
  var battleModel
  var fighterEntity
  var fighterId
  var battleId

  before(function() {
    fighterModel = mr.model('fighter')
    battleModel = mr.model('battle')

    return fighterModel.create({name: 'Robert Baratheon', health: 50}).then(function(fighter){
      fighterEntity = fighter
    })

  })

  it('should add string into a nested array in the document utilizing addToSet', function(){
    var onRejected = function(err) {
      console.error('err', err)
    }

    return battleModel.create({name: 'Battle of the Trident', year: 281}).then(function(battle){
      battle.fighters.length.should.equal(0)

      battleId = battle._id
      fighterId = fighterEntity._id

      return battleModel.addToSet({year: 281}, 'fighters', fighterId).then(function(length){

        length.should.eql(1)
        return battleModel.query().findOne({_id: battleId}).exec().promise.then(function(battle){
          battle.fighters[0].should.eql(fighterId)
        }, onRejected)
      }, onRejected)
    })

  })

  it('should remove an item from a nested array utilizing removeFromSet', function(done) {	//safeguards, that we don't overwrite $inc with version incrementing object
    return battleModel.removeFromSet({_id: battleId}, 'fighters', fighterId).then(function(length){
      length.should.eql(0)
      done()
    })
  })


  after(function() {
    return Promise.all([
      battleModel.remove({_id: battleId}),
      fighterModel.remove(fighterEntity)
    ])
  })

})
