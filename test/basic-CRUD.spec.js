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

  it('should return available models', function () {
    return mr.fetchAllModels().then((models) => {
      models[0].name.should.equal('location')
      models.length.should.equal(4)
    })
  })

  it('should have a method getSchema for getting a schema of the model', function () {
    return fighterModel.getSchema().then(schema => {
      schema.should.eql({
        name: {type: String, required: true},
        health: Number,
        born: Date,
        death: {type: Date, permissions: {R: 4, W: 20}},
        owner: {
          ref: 'user',
          type: 'ObjectId'
        }
      })
    }, (e) => {
      console.log(e.stack)
      throw e
    })
  })

  describe('rerun liveQueries', function () {
    it('should rerun after authorization promise resolves', function () {

    })
    it('should rerun immediatelly after reconnect if not authorized asynchronously', function () {

    })

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

  it('should fail to create when validation fails with a mongoose errors', function (done) {
    fighterModel.create({health: 'ssf'}).then(function (created) {
      setTimeout(() => {
        throw new Error('this should not happen')
      })
    }, (err) => {
      err.errors.health.name.should.equal('CastError')
      err.errors.name.name.should.equal('ValidatorError')
      done()
    })
  })

  it('should allow to create an entity of a model', function (done) {
    LQ.onAny(function (evName, params) {
      evName.should.be.equal('add')
      fighterEntity = params[1]
      fighterEntity.name.should.equal('Arya')
      done()
    })

    fighterModel.create({name: 'Arya', health: 50, isNew: false}).then(function (created) {
      created.should.have.property('_id')
      created.should.have.property('owner')
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
    return fighterModel.query().findOne({name: 'Arya'}).exec().then(function (arya) {
      arya.health.should.eql(50)
    })
  })

  it('should be able to update an entity of a model', function () {
    fighterEntity.health += 10
    return fighterModel.update(fighterEntity)
  })

  it('should fail when we try to update with malformed _id', function (done) {
    fighterEntity.health += 10
    var fakeId = 'fake6c5c6983ef1828ec7af4'
    fighterModel.update({_id: fakeId}).then(function () {
      throw new Error('Entity should not have been updated')
    }, function (err) {
      err.message.should.equal('Cast to ObjectId failed for value "fake6c5c6983ef1828ec7af4" at path "_id"')
      done()
    })
  })

  it('should fail when we try to update nonexistent entity', function (done) {
    fighterEntity.health += 10
    var fakeId = '575846963e5d8a9541c41e54'
    fighterModel.update({_id: fakeId}).then(function () {
      throw new Error('Entity should not have been updated')
    }, function (err) {
      err.message.should.equal('no document to save found with _id: 575846963e5d8a9541c41e54')
      done()
    })
  })

  it('should fail when we try to update with an older __v of that entity', function (done) {
    fighterEntity.health += 10
    fighterEntity.__v = 0 // wheres actual is 1 after the update in previous test
    fighterModel.update(fighterEntity).then(function () {
      throw new Error('Entity should not have been updated')
    }, function (err) {
      err.message.should.equal('Document version mismatch-your copy is version 0, but server has 1')
      done()
    })
  })

  it('should be able to delete an entity of a model', function () {
    return fighterModel.remove({_id: fighterId})
  })

  it('should be able to invoke static methods on model over rpc', function (done) {
    fighterModel.static('testStaticMethod')('works').then((ret) => {
      ret.should.equal('static method works')
      done()
    })
  })

  it("should be able to remove documents, which don't match anymore from the live query result", function (done) {
    return fighterModel.create({name: 'Gendry', health: 50}).then(() => {
      LQ = fighterModel.liveQuery().find().gte('health', 10).exec()
      LQ.on('init', function (params) {
        const gendry = params.docs[0]
        gendry.health = 0
        LQ.onAny(function (evName, params) {
          // console.log(evName, params)
          if (evName === 'update') {
            LQ.result.length.should.equal(0)
            console.log(gendry)
            
            fighterModel.remove(gendry).then(done)
          }
        })
        fighterModel.update(gendry)
      })

    })

  })
})
