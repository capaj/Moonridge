'use strict'
const getIndexInSorted = require('./indexInSortedArray')
const populateWithClientQuery = require('./populate-doc-util')
const liveQueriesMap = require('./live-queries-map')  // mapped by the query stringified
const debug = require('debug')('moonridge:live-query')
var _ = require('lodash')

/**
 * @param {String} qKey
 * @param {Mongoose.Query} mQuery
 * @param {Object} queryMethodsHandledByMoonridge are query methods which are important for branching in the LQ
 *                  syncing logic, we need their arguments accessible on separated object to be able to run
 *                  liveQuerying effectively
 * @returns {Object}
 * @constructor
 * @param {Object} model
 */
function LiveQuery (qKey, mQuery, queryMethodsHandledByMoonridge, model) {
  this.docs = []
  this.listeners = {}
  this.mQuery = mQuery   // mongoose query

  if (this.mQuery.op === 'distinct') {
    this.sync = LiveQuery.prototype.syncDistinct
  }

  this.qKey = qKey
  this.model = model
  this.modelName = model.modelName
  this.indexedByMethods = queryMethodsHandledByMoonridge // serializable client query object
  liveQueriesMap.get(this.model)[qKey] = this

  return this
}

LiveQuery.prototype = {
  destroy: function () {
    delete liveQueriesMap.get(this.model)[this.qKey]
  },
  /**
   *
   * @param {Document.Id} id
   * @returns {Number} -1 when not found
   */
  getIndexById: function (id) {
    id = id.id
    var i = this.docs.length
    while (i--) {
      var doc = this.docs[i]
      if (doc && doc._id.id === id) {
        return i
      }
    }
    return i
  },
  /**
   *
   * @param {Object|Mongoose.Document} doc
   * @param {String} evName
   * @param {Number} resultIndex number, indicates an index where the doc should be inserted, -1 for a document which
   *                 is no longer in the result of the query
   */
  _distributeChange: function (doc, evName, resultIndex) {
    var self = this
    var actuallySend = function () {
      for (var socketId in self.listeners) {
        var listener = self.listeners[socketId]
        var toSend = null

        if (listener.qOpts.count) {
          // we don't need to send a doc when query is a count query
        } else if (self.mQuery.op === 'distinct') {
          toSend = doc
        } else {
          if (evName === 'remove' && doc._id) {
            toSend = doc._id.toString() // remove needs only _id, which should be always defined
          } else {
            toSend = self.model.moonridgeOpts.dataTransform(doc, 'R', listener.socket)
          }
        }

        debug('sending ', toSend, ' event ', evName, ', pos param ', resultIndex)
        listener.socket.rpc('MR.' + self.modelName + '.' + evName)(listener.clIndex, toSend, resultIndex)
      }
    }

    if (typeof doc.populate === 'function') {
      populateWithClientQuery(doc, this.indexedByMethods.populate, function (err, populated) {
        if (err) {
          throw err
        }
        doc = populated.toObject()
        actuallySend()
      })
    } else {
      actuallySend()
    }
  },
  registerListener: function (opts) {
    const socket = opts.socket
    debug(`listener ${socket.id} registered`)
    this.listeners[socket.id] = opts
  },
  /**
   * removes a socket listener from liveQuery and also destroys the whole liveQuery if no more listeners are present
   * @param socket
   */
  removeListener: function (socket) {
    if (this.listeners[socket.id]) {
      delete this.listeners[socket.id]
      if (Object.keys(this.listeners).length === 0) {
        this.destroy() // this will delete a liveQuery from liveQueries
      }
    } else {
      return new Error('no listener present on LQ ' + this.qKey)
    }
  },
  syncDistinct: function (opts) {
    var self = this

    return this.mQuery.exec(function (err, values) {
      if (err) {
        console.error('err', err)
        throw err
      }
      var syncObj = {}
      syncObj.add = _.difference(values, self.values)
      syncObj.remove = _.difference(self.values, values)
      self.values = values
      debug('reran distinct query with a result: ', values, syncObj)
      self._distributeChange(syncObj, 'distinctSync')
    })
  },
  /**
   * @param {Object} opts sync options
   * @param {Object|String} opts.mongooseDoc a document or an id of it to be synced
   */
  sync: function (opts) {
    var self = this
    var evName = opts.evName

    var doc
    var id

    if (opts.mongooseDoc.toObject) {
      doc = opts.mongooseDoc.toObject()
      id = doc._id
    } else {
      id = opts.mongooseDoc
    }
    var cQindex = this.getIndexById(id) // index of current doc in the query

    if (evName === 'remove' && this.docs[cQindex]) {
      this.docs.splice(cQindex, 1)
      this._distributeChange(doc || id.toString(), evName, cQindex)

      if (this.indexedByMethods.limit) {
        var skip = 0
        if (this.indexedByMethods.skip) {
          skip = this.indexedByMethods.skip[0]
        }
        skip += this.indexedByMethods.limit[0] - 1
        opts.model.find(this.mQuery).lean().skip(skip).limit(1)
          .exec(function (err, docArr) {
            if (err) {
              throw err
            }
            if (docArr.length === 1) {
              var toFillIn = docArr[0]   // first and only document
              if (toFillIn) {
                self.docs.push(toFillIn)
                self._distributeChange(toFillIn, 'add', cQindex)
              }
            }
          }
        )
      } else if (this.indexedByMethods.findOne) {
        this.mQuery.exec(function (err, doc) {
          if (err) {
            throw err
          }
          if (doc) {
            self.docs.push(doc)
            self._distributeChange(doc, 'add', cQindex)
          }
        })
      }
    } else {
      var checkQuery = opts.model.findOne(this.mQuery)
      debug('After ' + evName + ' checking ' + id + ' in a query ' + self.qKey)
      if (!this.indexedByMethods.findOne) {
        checkQuery = checkQuery.where('_id').equals(id)
        if (doc) {
          checkQuery.select('_id')
        }
      }
      checkQuery.exec(function (err, checkedDoc) {
        if (err) {
          throw err
        }
        if (checkedDoc) {   // doc satisfies the query

          if (!doc) { // this is needed for event which don't get a mongoose object passed at the beginning
            doc = checkedDoc
          }

          if (self.indexedByMethods.populate.length !== 0) {    // needs to populate before send
            doc = checkedDoc
          }
          if (self.indexedByMethods.findOne) {
            self.docs[0] = checkedDoc
            return self._distributeChange(checkedDoc, 'add', 0)
          }
          if (self.indexedByMethods.sort) {
            var sortBy = self.indexedByMethods.sort[0].split(' ') // check for string is performed on query initialization
            var index
            if (evName === 'create') {
              evName = 'add'
              if (cQindex === -1) {
                index = getIndexInSorted(doc, self.docs, sortBy)
                self.docs.splice(index, 0, doc)
                if (self.indexedByMethods.limit) {
                  if (self.docs.length > self.indexedByMethods.limit[0]) {
                    self.docs.splice(self.docs.length - 1, 1)
                  }
                }
              }
            }
            if (evName === 'update') {
              index = getIndexInSorted(doc, self.docs, sortBy)

              if (cQindex === -1) {
                self.docs.splice(index, 0, doc)    // insert the document
              } else {
                if (cQindex !== index) {
                  if (cQindex < index) {  // if we remove item before, the whole array shifts, so we have to compensate index by 1.
                    self.docs.splice(cQindex, 1)
                    self.docs.splice(index - 1, 0, doc)
                  } else {
                    self.docs.splice(cQindex, 1)
                    self.docs.splice(index, 0, doc)
                  }
                } else {
                  self.docs[index] = doc
                }
              }
            }
            self._distributeChange(doc, evName, index)
          } else {
            if (evName === 'create') {
              self.docs.push(doc)
              self._distributeChange(doc, 'add', cQindex)
            }
            if (evName === 'update') {
              var newIndex = self.docs.push(doc)
              self._distributeChange(doc, evName, newIndex) // doc wasn't in the result, but after update is
            }
          }
        } else {
          debug('Checked doc ' + id + ' in a query ' + self.qKey + ' was not found')
          if (evName === 'update' && cQindex !== -1) {
            self.docs.splice(cQindex, 1)
            self._distributeChange(doc || id, evName, -1)   // doc was in the result, but after update is no longer
          }
        }
      })
    }
  }
}

module.exports = LiveQuery
