const debug = require('debug')('moonridge:baucis')
const baucis = require('baucis')
require('baucis-swagger')

const mapVerbToOperation = {
  POST: 'create',
  GET: 'read',
  PUT: 'update',
  DELETE: 'remove'
}

baucis.Controller.decorators(function (options, protect) {
  var controller = this
  const model = controller.model()
  const mrOpts = model.moonridgeOpts
  controller.request(function (request, response, next) {
    // expects request.moonridge to be something like {user: {privilege_level: 30}}
    debug(request.method)
    const operation = mapVerbToOperation[request.method]
    let errWhileCheckingPermissions
    try {
      mrOpts.checkPermission(request, operation)
    } catch (err) {
      errWhileCheckingPermissions = err
    }
    debug('errWhileCheckingPermissions ', errWhileCheckingPermissions)
    if (errWhileCheckingPermissions) {
      return response.status(403).send(baucis.Error.Forbidden(`You lack a privilege to ${request.method} ${model.modelName} collection`))
    }
    request.baucis.incoming(function (ctx, cb) {
      const doc = ctx.doc
      let errWhileCheckingPermissions
      try {
        mrOpts.checkPermission(request, mapVerbToOperation[request.method], doc)
      } catch (err) {
        errWhileCheckingPermissions = err
      }
      if (errWhileCheckingPermissions === undefined) {
        return cb(null, ctx)
      } else {
        return response.status(403).send(baucis.Error.Forbidden(`You lack a privilege to ${request.method} ${model.modelName} collection`))
      }
    })
    request.baucis.outgoing(function (ctx, cb) {
      // var doc = ctx.doc.toObject()
      // TODO mask properties
      return cb(null, ctx)
    })
    return next()
  })
  debug(`${model.modelName} baucis decorator ran`)
})

module.exports = baucis
