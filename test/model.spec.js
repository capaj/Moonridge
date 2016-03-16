/* eslint-env node, mocha */
'use strict'
const MR = require('../moonridge')
const locals = require('./e2e-smoketest/localVariables.json')
MR.connect(locals.connString)
var expect = require('chai').expect

describe('Moonridge model', function () {
  let sampleModel
  let server
  let LQ

  it('should have a baucis controller', function () {
    sampleModel = MR.model('first_test_model', {
      name: String
    })
    const ctrl = sampleModel.controller
    expect(ctrl).to.be.a('function')
    expect(ctrl.put).to.be.a('function')
    expect(ctrl.get).to.be.a('function')
    expect(ctrl.delete).to.be.a('function')
    expect(ctrl.post).to.be.a('function')
  })

  it('should run onExistence for each created instance of a model', function (done) {
    sampleModel = MR.model('sample_model_two', {
      name: String
    }, {
      onExistence: function (d) {
        expect(d.name).to.eql('on existence test')
        done()
      }
    })
    const doc = new sampleModel({name: 'on existence test'})
    doc.save()
  })

  it('should NOT save the new model if onExistence throws', function (done) {
    let testModel = MR.model('sample_model_three', {
      name: String
    }, {
      onExistence: function (d) {
        return Promise.reject(new Error('just a test error'))
      }
    })
    const doc = new testModel({name: 'onexistence throw test'})
    doc.save().then(() => {}, (e) => {
      expect(e.message).to.equal('just a test error')
      done()
    })
  })

  it('should run schemaInit on registering a new model', function (done) {
    sampleModel = MR.model('sample_model', {
      name: String
    }, {
      schemaInit: function (schema) {
        expect(schema.pathType('name')).to.eql('real')
        done()
      },
      ownerRequired: false
    })

    server = MR.bootstrap(8079)
  })

  it('should trigger schema events even when utilising findByIdAnd... methods on moonridge model directly', function (done) {
    // normally mongoose would not trigger those-they are only triggered when doing doc.save().
    // We need to have them triggered in order for liveQueries to work
    var c = 0
    var id

    var fakeSocket = {
      id: 'testSocketId',
      moonridge: {
        registeredLQs: {},
        user: {_id: '56520e8adc7237d62a081f6a'}
      },
      on: function (name, cb) {
        expect(typeof cb).to.equal('function')
      },
      rpc: function (method) {
        return function () {
          c++
          if (c === 3) {
            expect(arguments[1]).to.equal(id.toString())
          }
        }
      }
    }
    LQ = sampleModel.rpcExposedMethods.liveQuery.call(fakeSocket, [], 1)

    sampleModel.rpcExposedMethods.create.call(fakeSocket, {name: 'test'}).then(function (created) {
      id = created._id.valueOf()
      sampleModel.on('remove', function (doc) {
        expect(doc).to.equal(id)
        setTimeout(function () {
          expect(c).to.equal(3)
          done()
        }, 100)
      })

      sampleModel.on('update', function (doc) {
        expect(doc).to.equal(id)
        setTimeout(function () {
          sampleModel.findByIdAndRemove(id)
          expect(c).to.equal(2)
        }, 100)
      })

      sampleModel.findByIdAndUpdate(id, {name: 'test2'})
    }, function (err) {
      console.error(err.errors)
      setTimeout(() => {
        throw err
      })
    })
  })

  it.skip('should rethrow when model initialisation fails for a document with marking the error', function () {

  })

  it('should expose statics of a model', function () {
    // TODO
  })
})
