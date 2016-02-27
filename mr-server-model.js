const exposeMethods = require('./mr-rpc-methods')
const debug = require('debug')('moonridge:server')
const _ = require('lodash')
const mongoose = require('mongoose')
const baucis = require('./utils/baucis')

/**
 * @param {String} name
 * @param {Schema} schema NOTE: don't use these properties on your schemas: '$$hashKey', '__id', '__v', those names are
 * reserved for angular and Mongoose
 * @param {Object} opts
 * @param {Boolean} opts.readOnly will expose only find and sub/pub methods
 * @param {Object} [opts.permissions] should look something like:
                                 permissions: {
                                  C: 1,
                                  R: 0,
                                  U: 5,
                                  D: 5
                                }
 * @param {Object} opts.statics will extend the mongoose schema.statics so that you can call this function on your model
 * @param {Function} opts.schemaInit gives you opportunity to use schema before mongoose model is instantiated
 * @param {Function} opts.onExistence similar to subscribing to create event, but with an added benefit that this gets called for preexisting documents in the DB on startup
 * @returns {Object}
 */
module.exports = function moonridgeModel (name, schema, opts) {
  opts = opts || {}
  var ownerSchema = {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user'
  }

  if (name !== 'user') {
    _.assign(schema, {
      owner: ownerSchema
    })   // users own all other entities
  }

  // mongoose schema
  var mgSchema = new mongoose.Schema(schema, opts.schemaOpts)

  if (opts.statics) {
    _.extend(mgSchema.statics, opts.statics)
  }

  if (opts.schemaInit) {
    debug('running schemaInit for ' + name)
    opts.schemaInit(mgSchema)
  }

  var paths = mgSchema.paths
  var pathPermissions = {}
  for (var prop in paths) {
    if (paths[prop].options) {
      var perm = paths[prop].options.permissions // looks like {R: 10, W: 20}
      if (perm !== undefined) {
        pathPermissions[prop] = perm
      }
    }
  }
  mgSchema.pathPermissions = pathPermissions // prepared object for handling access control

  const newDocs = new Set()
  mgSchema.pre('save', function (next) {
    if (this.isNew) {
      newDocs.add(this._id)
      if (opts.onExistence) {
        return Promise.resolve(opts.onExistence.call(model, this)).then(() => {
          next()
        }, next)
      }
    }
    next()
  })

  // Hook `save` post method called after creation/update
  mgSchema.post('save', function postSave (doc) {
    if (newDocs.has(doc._id)) {
      newDocs.delete(doc._id)
      model.emit('create', doc)
    } else {
      model.emit('update', doc)
    }
    return true
  })

  mgSchema.post('remove', function postRemove (doc) {
    model.emit('remove', doc)
  })

  var model = mongoose.model(name, mgSchema)
  if (opts.onExistence) {
    model.initPromise = new Promise(function (resolve, reject) {
      const stream = model.find().stream()
      const proms = []
      stream.on('data', function (doc) {
        proms.push(Promise.resolve(opts.onExistence(doc)).catch((e) => {
          console.error('failed onExistence initialisation on ', doc, ' error: ', e)
          e.fromMoonridgeModelInit = true
          e.doc = doc
          throw e // rethrown with fromMoonridgeModelInit so that it can be handled in process-wide handler
        }))
      })
      .on('error', reject)
      .on('close', function () {
        Promise.all(proms).then(resolve, reject)
      })
    })
  }
  const exposeCallback = exposeMethods(model, mgSchema, opts)

  // these two methods are possible to use and your LQ will refresh accordingly,
  // it is not possible with their originals
  const originalFindByIdAndUpdate = model.findByIdAndUpdate
  const originalFindByIdAndRemove = model.findByIdAndRemove

  _.assign(model, {
    findByIdAndUpdate: function () {
      const args = arguments
      return originalFindByIdAndUpdate.apply(model, args).then(function (result) {
        model.emit('update', args[0])
        return result
      })
    },
    findByIdAndRemove: function () {
      const args = arguments
      return originalFindByIdAndRemove.apply(model, args).then(function (result) {
        model.emit('remove', args[0])
        return result
      })
    },
    schemaInit: opts.schemaInit,
    moonridgeSchema: schema,
    _exposeCallback: exposeCallback
  })

  model.controller = baucis.rest(name)

  Object.keys(schema.statics).forEach((methodName) => {
    model.controller.post(methodName, function (req, res, next) {
      Promise.resolve(model[methodName].apply(req, req.body)).then((value) => {
        res.send(value)
      }, next)
    })
  })
  return model
}
