var exposeMethods = require('./mr-rpc-methods')
var debug = require('debug')('moonridge:server')
var _ = require('lodash')
var mongoose = require('mongoose')

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

  var newDocs = []
  mgSchema.pre('save', function (next) {
    if (this.isNew) {
      newDocs.push(this._id)
    }
    next()
  })

  // Hook `save` post method called after creation/update
  mgSchema.post('save', function postSave (doc) {
    var indexInNewDocs = newDocs.indexOf(doc._id)
    if (indexInNewDocs !== -1) {
      newDocs.splice(indexInNewDocs, 1)
      mgSchema.emit('create', doc)
      if (opts.onExistence) {
        opts.onExistence.call(model, doc)
      }
    } else {
      mgSchema.emit('update', doc)
    }
    return true
  })

  mgSchema.post('remove', function postRemove (doc) {
    mgSchema.emit('remove', doc)
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
  var exposeCallback = exposeMethods(model, mgSchema, opts)

  // these two methods are possible to use and your LQ will refresh accordingly,
  // it is not possible with their originals
  var originalFindByIdAndUpdate = model.findByIdAndUpdate
  var originalFindByIdAndRemove = model.findByIdAndRemove

  _.assign(model, {
    findByIdAndUpdate: function () {
      var args = arguments
      return originalFindByIdAndUpdate.apply(model, args).then(function (result) {
        mgSchema.emit('update', args[0])
        return result
      })
    },
    findByIdAndRemove: function () {
      var args = arguments
      return originalFindByIdAndRemove.apply(model, args).then(function (result) {
        mgSchema.emit('remove', args[0])
        return result
      })
    },
    schemaInit: opts.schemaInit,
    moonridgeSchema: schema,
    _exposeCallback: exposeCallback
  })

  return model
}
