'use strict'
const _ = require('lodash')
const Schema = require('mongoose').Schema
const mss = require('mongoose-schema-serializer')(Schema)
const queryBuilder = require('./query-builder')
const LiveQuery = require('./utils/live-query')
const maxLQsPerClient = 100
const debug = require('debug')('moonridge:server')
const liveQueriesMap = require('./utils/live-queries-map')
const objectResolvePath = require('./utils/object-resolve-path')
/**
 *
 * @param {Model} model Moonridge model
 * @param {Schema} schema mongoose schema
 * @param {Object} opts same as for regNewModel in ./main.js
 */
var expose = function (model, schema, opts) {
  const liveQueries = {}
  const modelName = model.modelName
  liveQueriesMap.set(model, liveQueries)

  debug('expose model ', modelName)
  if (opts.dataTransform) {
    debug('dataTransform method is overridden for model "%s"', modelName)
  } else {
    /**
     * similar purpose as accessControlQueryModifier but works not on query, but objects, used whenever we are sending
     * new doc to client without querying
     * @param {Object} doc just JS object, not a real mongoose doc
     * @param {String} op operation that is about to happen, possible values are: 'R', 'W'
     * @param {Socket} socket
     * @returns {*}
     */
    opts.dataTransform = function deleteUnpermittedProps (doc, op, socket) {
      var userPL = socket.moonridge.user.privilege_level

      var pathPs = schema.pathPermissions
      var docClone = _.clone(doc)

      for (var prop in pathPs) {
        var perm = pathPs[prop]
        if (perm === false) {
          delete docClone[prop]
        } else {
          if (perm[op] && perm[op] > userPL) {
            if (docClone.hasOwnProperty(prop)) {
              delete docClone[prop]
            }
          }
        }
      }
      return docClone
    }
  }

  const modelSyncFactory = function (evName) {   // will be called by schema's event firing
    return function (mDoc) {
      Object.keys(liveQueries).forEach(function (LQString) {
        setImmediate(function () {	// we want to break out of promise error catching
          liveQueries[LQString].sync({evName: evName, mongooseDoc: mDoc, model: model})
        })
      })
    }
  }

  const evNames = [
    'create',
    'update',
    'remove'
  ]
  const subscribers = {}

  evNames.forEach(function (evName) {
    const modelSynchronization = modelSyncFactory(evName)
    model.on(evName, function (doc) {
      modelSynchronization(doc)
    })
  })

  if (!opts.checkPermission) {
    /**
     * default checkPermission handler
     * @param {String} op operation to check, can be 'create', 'read', 'update', 'delete'
     * @param socket
     * @param {Document} [doc]
     * @returns {Boolean} true when user has permission, false when not
     */
    opts.checkPermission = function (socket, op, doc) {
      var user = socket.moonridge.user
      var PL = user.privilege_level
      debug('checkPermission privilige level', PL, ', op ', op, ', doc ', doc)

      if (doc && op !== 'C') {   // if not creation, with creation only privileges apply
        if (doc.owner && doc.owner.toString() === user.id) {
          return true    // owner does not need any permissions
        }
        if (doc.id === user.id) {
          return true    // user modifying himself also has permissions
        }
      }

      if (this.permissions && this.permissions[op]) {
        if (PL < this.permissions[op]) { // if bigger than connected user's
          throw new Error(`You lack a privilege to ${op} ${modelName} collection`)
        }
      }
    }
  } else {
    debug('checkPermission method is overridden for model "%s"', modelName)
  }

  /**
   *  This function should always modify the query so that no one sees properties that they are not allowed to see,
   *  the query is modified right on the input and not somewhere later because then we get less variation and therefore less queries created
   *  and checked on the server
   * @param {Object} clQuery object parsed from stringified argument
   * @param {Schema} schema mongoose schema
   * @param {Number} userPL user privilege level
   * @param {String} op
   * @returns {Object}
   */
  function accessControlQueryModifier (clQuery, schema, userPL, op) { // guards the properties that are marked with higher required permissions for reading
    var pathPs = schema.pathPermissions
    var select
    if (clQuery.select) {
      select = clQuery.select[0]
    } else {
      select = {}
    }
    if (_.isString(select)) {
      // in this case, we need to parse the string and return the object notation
      var props = select.split(' ')
      var i = props.length
      while (i--) {
        var clProp = props[i]
        if (clProp[0] === '-') {
          clProp = clProp.substr(1)
          select[clProp] = 0
        } else {
          select[clProp] = 1
        }
      }
    }
    for (var prop in pathPs) {
      var perm = pathPs[prop]
      if (perm[op] && perm[op] > userPL) {
        select[prop] = 0
      }
    }

    clQuery.select = [select] // after modifying the query, we just put it back as array so that we can call it with apply
    return clQuery
  }

  function runQueryMiddleware (socket, query) {
    if (opts.queryMiddleware) {
      opts.queryMiddleware.forEach((middlewareFn) => {
        middlewareFn.call(socket, query, socket.moonridge.user)
      })
    }
  }

  const mrMethods = {
    /**
     * for running normal DB queries
     * @param {Object} clientQuery
     * @returns {Promise} from executing the mongoose.Query
     */
    query: function (clientQuery) {
      opts.checkPermission(this, 'read')
      accessControlQueryModifier(clientQuery, schema, this.moonridge.privilege_level, 'R')
      debug('query to be built: ', clientQuery)
      var queryAndOpts = queryBuilder(model, clientQuery)
      runQueryMiddleware(this, queryAndOpts.mQuery)

      return queryAndOpts.mQuery.exec()
    },

    unsubLQ: function (index) {	// when client uses stop method on LQ, this method gets called
      var LQ = this.moonridge.registeredLQs[index]
      if (LQ) {
        delete this.moonridge.registeredLQs[index]
        LQ.removeListener(this)
      } else {
        throw new Error(`Index ${index} in LQ unsubscribe is not valid!`)
      }
    },
    /**
     * @param {Object} clientQuery object to be parsed by queryBuilder, consult mongoose query.js docs for reference
     * @param {Number} LQIndex clientside index of this particular query
     * @returns {Promise} from mongoose query, resolves with an array of documents
     */
    liveQuery: function (clientQuery, LQIndex) {
      opts.checkPermission(this, 'read')
      accessControlQueryModifier(clientQuery, schema, this.moonridge.privilege_level, 'R')
      debug('liveQuery to be built: ', clientQuery)

      const socket = this

      return new Promise(function (resolve, reject) {
        var builtQuery = queryBuilder(model, clientQuery)
        const mQuery = builtQuery.mQuery
        const queryOptions = builtQuery.opts

        runQueryMiddleware(socket, mQuery)

        var qKey = JSON.stringify(clientQuery)
        var LQ = liveQueries[qKey]

        if (!mQuery.exec) {
          throw new Error('query builder has returned invalid query')
        }

        var pushListeners = function (LQOpts) {
          var activeClientQueryIndexes = Object.keys(socket.moonridge.registeredLQs)

          if (activeClientQueryIndexes.length > maxLQsPerClient) {
            reject(new Error('Limit for queries per client reached. Try stopping some live queries.'))
            return
          }

          var resolveFn = function () {
            debug('resolving LQ', modelName, qKey)
            var retVal = {index: LQIndex}

            if (LQOpts.hasOwnProperty('count')) {
              retVal.count = LQ.docs.length
            } else if (mQuery.op === 'distinct') {
              retVal.values = LQ.values
            } else {
              retVal.docs = LQ.docs
            }
            LQ.registerListener({socket: socket, clIndex: LQIndex, qOpts: LQOpts})
            resolve(retVal)
          }

          if (LQ.firstExecPromise) {
            LQ.firstExecPromise.then(resolveFn).catch((e) => {
              throw e
            })
          } else {
            resolveFn()
          }
        }
        if (LQ) {
          pushListeners(queryOptions)
        } else {
          LQ = new LiveQuery(qKey, mQuery, queryOptions, model)

          var onRejectionOfFirstQuery = function (err) {
            debug('First LiveQuery exec failed with err ' + err)
            reject(err)
            LQ.destroy()
          }
          LQ.firstExecPromise = mQuery.exec().then(function (rDocs) {
            delete LQ.firstExecPromise
            debug('mQuery.op', mQuery.op)
            if (mQuery.op === 'findOne') {
              if (rDocs) {
                LQ.docs = [rDocs]  // rDocs is actually just one document
              } else {
                LQ.docs = []
              }
            } else if (mQuery.op === 'distinct') {
              LQ.values = rDocs
            } else {
              var i = rDocs.length
              while (i--) {
                LQ.docs[i] = rDocs[i]
              }
            }
            return rDocs
          }, onRejectionOfFirstQuery)
          pushListeners(queryOptions)
        }

        if (!socket.moonridge.registeredLQs[LQIndex]) { // query can be reexecuted when user authenticates, then we already have
          socket.moonridge.registeredLQs[LQIndex] = LQ
        }
      })
    },

    /**
     * @returns {Object} model's schema
     */
    getSchema: function () {
      return mss.stringify(model.moonridgeSchema)
    },
    subscribe: function (evName) {
      const socket = this
      if (!subscribers.hasOwnProperty(evName)) {
        subscribers[evName] = new Set()
        model.on(evName, (doc) => {
          Array.from(subscribers[evName]).forEach((socket) => {
            debug('schemaEvent ', evName)
            socket.emit('schemaEvent', {
              modelName: modelName,
              evName: evName,
              doc: doc
            })
          })
        })
      }
      opts.checkPermission(this, 'read')
      const subscribersForThisEvent = subscribers[evName]
      subscribersForThisEvent.add(socket)
      debug(`there is a new subscriber ${socket.id} for model ${modelName} event ${evName}`)
      socket.on('disconnect', () => {
        subscribersForThisEvent.delete(socket)
        debug(`subscriber disconnected ${socket.id} unsubscribed from model ${modelName} event ${evName}`)
      })
    },
    unsubscribe: function (evName) {
      return subscribers[evName].delete(this)
    }
  }

  if (opts.readOnly !== true) {
    const updatePromisesMap = new Map()
    _.extend(mrMethods, {
      /**
       * @param {Object} newDoc
       * @returns {Promise}
       */
      create: function (newDoc) {
        opts.checkPermission(this, 'create')
        opts.dataTransform(newDoc, 'W', this)
        if (schema.paths.owner && newDoc.owner === undefined) {
          // we should set the owner field if it is present
          newDoc.owner = this.moonridge.user._id
        }
        return model.create(newDoc)
      },
      /**
       * deletes a document by it's id
       * @param {String} id
       * @returns {Promise}
       */
      remove: function (id) {
        const socket = this
        return new Promise(function (resolve, reject) {
          model.findById(id, function (err, doc) {
            if (err) {
              return reject(err)
            }
            if (doc) {
              try {
                opts.checkPermission(socket, 'remove', doc)
              } catch (err) {
                reject(err)
              }
              doc.remove(function (err) {
                if (err) {
                  reject(err)
                }
                debug('removed a doc _id ', id)
                resolve()
              })
            } else {
              reject(new Error('no document to remove found with _id: ' + id))
            }
          })
        })
      },
      /**
       * finds a document by _id and then saves it
       * @param {Object} toUpdate a document which will be saved, must have an existing _id
       * @param {Boolean} resolveWhole
       * @returns {Promise}
       */
      update: function (toUpdate, resolveWhole) {
        const socket = this
        const id = toUpdate._id
        const runUpdate = () => {
          return new Promise(function (resolve, reject) {
            delete toUpdate._id
            model.findById(id, function (err, doc) {
              if (err) {
                debug('rejecting an update because: ', err)
                return reject(err)
              }
              if (doc) {
                try {
                  opts.checkPermission(socket, 'update', doc)
                } catch (err) {
                  reject(err)
                }
                opts.dataTransform(toUpdate, 'W', socket)
                const previousVersion = doc.toObject()
                if (toUpdate.__v !== undefined) {
                  if (toUpdate.__v !== doc.__v) {
                    reject(new Error('Document version mismatch-your copy is version ' + toUpdate.__v + ', but server has ' + doc.__v))
                  } else {
                    delete toUpdate.__v // save a bit of unnecessary work when we are extending doc on the next line
                  }
                }
                _.merge(doc, toUpdate)
                doc.increment()
                doc.save(function (err) {
                  if (err) {
                    debug('rejecting a save because: ', err)
                    reject(err)
                  } else {
                    debug('document ', id, ' saved, version now ', doc.__v)
                    model.emit('updated', doc, previousVersion)  // this is emitted only when updated via this update method
                    if (resolveWhole) {
                      return resolve(doc.toObject())
                    }
                    resolve(doc.__v)	// we don't resolve with new document because when you want to display
                    // current version of document, just use liveQuery
                  }
                })
              } else {
                reject(new Error('no document to save found with _id: ' + id))
              }
            })
          })
        }

        const newProm = Promise.resolve(updatePromisesMap.get(id)).then(runUpdate, runUpdate)
        updatePromisesMap.set(id, newProm)
        const deleteProm = () => {
          updatePromisesMap.delete(id)
        }
        newProm.then(deleteProm, deleteProm)
        return newProm
      },
      /**
       * finds one document with a supplied query and then pushes item into it's array on a path
       * @param {Object} query
       * @param {String} path
       * @param {*} item
       * @returns {Promise} is resolved with a length of the array when item is pushed, is rejected when path is not found or item
       */
      addToSet: function (query, path, item) {
        const socket = this
        return new Promise(function (resolve, reject) {
          model.findOne(query, function (err, doc) {
            if (err) {
              debug('rejecting an update because: ', err)
              return reject(err)
            }
            if (doc) {
              try {
                opts.checkPermission(socket, 'update', doc)
              } catch (err) {
                reject(err)
              }
              var previousVersion = doc.toObject()

              var set = objectResolvePath(doc, path)
              if (Array.isArray(set)) {
                if (set.indexOf(item) === -1) {
                  set.push(item)
                } else {
                  return resolve(set.length)
                }
              } else {
                return reject(new TypeError('Document ', doc._id, " hasn't an array on path ", path))
              }
              doc.increment()

              doc.save(function (err) {
                if (err) {
                  debug('rejecting a save because: ', err)
                  reject(err)
                } else {
                  debug('document ', doc._id, ' saved, version now ', doc.__v)
                  model.emit('addedToSet', doc, previousVersion)
                  resolve({length: set.length, __v: doc.__v})	// we don't resolve with new document because when you want to display
                  // current version of document, just use liveQuery
                }
              })
            } else {
              reject(new Error('no document to update found with query: ', query))
            }
          })
        })
      },
      /**
       * finds one document with a supplied query and then pushes an item into it's array on a path
       * @param {Object} query
       * @param {String} path
       * @param {*} item it is highly recommended to use simple values, not objects
       * @returns {Promise} is resolved with a length of the array when item is pushed, is rejected when path is not found or item
       */
      removeFromSet: function (query, path, item) {
        const socket = this
        return new Promise(function (resolve, reject) {
          model.findOne(query, function (err, doc) {
            if (err) {
              debug('rejecting an update because: ', err)
              return reject(err)
            }
            if (doc) {
              try {
                opts.checkPermission(socket, 'update', doc)
              } catch (err) {
                reject(err)
              }
              var previousVersion = doc.toObject()

              var set = objectResolvePath(doc, path)
              if (Array.isArray(set)) {
                var itemIndex = set.indexOf(item)	// this would be always -1 for objects
                if (itemIndex !== -1) {
                  set.splice(itemIndex, 1)
                } else {
                  return resolve(set.length)
                }
              } else {
                return reject(new TypeError('Document ', doc._id, " hasn't an array on path ", path))
              }
              doc.increment()
              doc.save(function (err) {
                if (err) {
                  debug('rejecting a save because: ', err)
                  reject(err)
                } else {
                  debug('document ', doc._id, ' saved, version now ', doc.__v)
                  model.emit('removedFromSet', doc, previousVersion)
                  resolve({length: set.length, __v: doc.__v})	// we don't resolve with new document because when you want to display
                  // current version of document, just use liveQuery
                }
              })
            } else {
              reject(new Error('no document to update found with query: ', query))
            }
          })
        })
      },
      callMethod: function (onId, methodName, args) {
        const method = schema.methods[methodName]
        opts.checkPermission(this, 'executeMethod')
        if (method.checkPermission) {
          method.checkPermission(this)  // should throw if not permitted
        }
        return model.findById(onId).then((doc) => {
          return method.apply(doc, args)
        })
      }
    })

    model.moonridgeOpts = opts
  }

  return function exposeCallback (rpcInstance) {
    const toExpose = {MR: {}}
    toExpose.MR[modelName] = mrMethods
    toExpose.MR[modelName].statics = schema.statics
    rpcInstance.expose(toExpose)

    _.assign(model, {
      rpcExposedMethods: mrMethods,
      modelName: modelName,
      queries: liveQueries
    }) // returning for health check
    debug('Model %s was exposed ', modelName)
    return model
  }
}

module.exports = expose
