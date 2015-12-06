/* eslint-env node, mocha */
require('chai').should()

var mrPair = require('./utils/run_server_client')
var mr = mrPair.client

describe('basic CRUD including working liveQueries', function () {
  this.timeout(4000)

  var fighterModel
  var battleModel
  var fighterEntity
  var fighterId
  var battleId
  var LQ
  before(function () {
    fighterModel = mr.model('fighter')
    battleModel = mr.model('battle')
  })

  it('should allow to live query model', function (done) {
    LQ = fighterModel.liveQuery().sort('health').exec()
    LQ.on('init', function (params) {
      params.docs.length.should.equal(0)
      done()
    })
  })

  it('should rerun liveQuery on authorization', function () {
    // TODO implement
  })

  it('should be able to call authorize and be authenticated with a new user', function () {
    return mr.authorize({nick: 'admin'}).then(function (user) {
      mr.user.privilege_level.should.equal(50)
    })
  })

  it('should be able to deauthorize and authorize again', function () {
    return mr.deAuthorize().then(function () {
      mr.user.privilege_level.should.equal(0)
      return mr.authorize({nick: 'admin'}).then(function (user) {
        mr.user.privilege_level.should.equal(50)
      })
    })
  })

  it('should allow to create an entity of a model', function (done) {
    LQ.onAny(function (evName, params) {
      evName.should.be.equal('add')
      console.log('params!!!!', params)
      fighterEntity = params[1]
      fighterEntity.name.should.equal('Arya')
      done()
    })

    fighterModel.create({name: 'Arya', health: 50, isNew: false}).then(function (created) {
      created.should.have.property('_id')
      created.should.not.have.property('isNew')	// this is reserved by Mongoose
      created.health.should.equal(50)
      fighterId = created._id
    })
  })

  it('should allow to stop the liveQuery-unsubscribe from client', function () {
    LQ.onAny(function (evName, params) {
      throw new Error('there should not be any event coming')
    })
    return LQ.stop().then(function (succes) {
      return fighterModel.create({name: 'Theon', health: 25}).then(function (theon) {
        return fighterModel.remove(theon)
      })
    })
  })

  it('should allow to query the model', function () {
    fighterModel.query().find({name: 'Arya'}).exec().promise.then(function (arya) {
      arya.health.should.eql(50)
    })
  })

  it('should be able to update an entity of a model', function () {
    fighterEntity.health += 10
    return fighterModel.update(fighterEntity)
  })

  it('should fail when we try to update nonexistent entity', function (done) {
    fighterEntity.health += 10
    var fakeId = 'fake6c5c6983ef1828ec7af4'
    fighterModel.update({_id: fakeId}).then(function () {
      throw new Error('Entity should not have been updated')
    }, function (err) {
      err.message.should.equal('no document to save found with _id: fake6c5c6983ef1828ec7af4')
      done()
    })
  })

  it('should be able to delete an entity of a model', function () {
    return fighterModel.remove({_id: fighterId})
  })
})
