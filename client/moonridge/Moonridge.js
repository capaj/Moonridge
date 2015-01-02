var QueryChainable = require('./query-chainable');
var isNumber = function(val) {
  return typeof val === 'number';
};

module.exports = function $MR($RPC, $q, $log, extend) {
  var MRs = {}; //stores instances of Moonridge backend instances
  var defaultBackend;

  /**
   * A Moonridge pseudo-constructor(don't call it with new keyword)
   * @param {String} name identifying the backend instance
   * @param {Promise} connectPromise should be resolved with an object with following properties:
   *                                  {String} url backend address where you will connect
   *                                  {Object} hs handshake for socket.io which you can access via socket.request._query
   * @param isDefault default if true, this backend will be used for any mr-controller, which does not have it defined
   * @returns {Moonridge} a Moonridge backend instance
   */
  function Moonridge(name, connectPromise, isDefault) {

    if (MRs[name]) {
      return MRs[name];
    }

    var defUser = {privilige_level: 1};
    var self = {user: defUser}; //by default, users priviliges are always set to 1
    MRs[name] = self;

    var models = {};

    /**
     * authentication, can be called at any time when you need to change user's identity/privileges
     * @param {Object} authObj
     * @returns {Promise}
     */
    self.auth = function(authObj) {
      var defer = $q.defer();
      self.socket.on('authSuccess', function (user){

        self.user = user;
        self.authObj = authObj;
        //TODO get user from backend and if not matching(server was restarted), reauthenticate
        self.socket.on('disconnect', function onDisconn() {
          self.socket.removeListener('disconnect', onDisconn);
          self.user = defUser;

          self.socket.on('reconnect', function onReconn() {
            self.socket.removeListener('disconnect', onReconn);
            self.socket.emit('auth', self.authObj);//recursively continues to handling authSuccess
          })
        });
        defer.resolve(user);
      });
      self.socket.on('authFailed', defer.reject);
      self.socket.emit('auth', authObj);
      return defer.promise;
    };

    var connDfd = $q.defer();
    self.connectPromise = connDfd.promise;
    $q.when(connectPromise).then(function(rParams) {
      self.rpcBackend = $RPC(rParams.url, rParams.hs);
      self.socket = self.rpcBackend.masterChannel;
      if (rParams.auth) {
        self.auth(rParams.auth).then(function() {
          connDfd.resolve(self.socket);
        });
      } else {
        connDfd.resolve(self.socket);
      }
    });

    self.getAllModels = function() {
      self.rpcBackend.loadChannel('Moonridge').then(function(mrChnl) {
        mrChnl.getModels().then(function(models) {
//                    TODO call getModel for all models
        });
      });
    };

    function onRejection(reason) {
      $log.error(reason);
      return $q.reject(reason);
    }

    /**
     * @param {String} name
     * @constructor
     */
    function Model(name) {
      var model = this;
      var lastIndex = 0;  //this is used for storing liveQueries in _LQs object as an index, each liveQuery has unique
      this.name = name;
      this._LQs = {};	// holds all liveQueries on client indexed by numbers starting from 1, used for communicating with the server
      this._LQsByQuery = {};	// holds all liveQueries on client indexed query in json, used for checking if the query does not exist already
      this.deferred = $q.defer();

      /**
       * @param {Object} toUpdate moonridge object
       * @returns {Promise}
       */
      this.update = function(toUpdate) {
        delete toUpdate.$$hashKey;
        return model.rpc.update(toUpdate).catch(onRejection);
      };

      /**
       * deletes a $$hashkey and calls serverside method
       * @param toCreate
       * @returns {Promise}
       */
      this.create = function(toCreate) {
        delete toCreate.$$hashKey;
        return model.rpc.create(toCreate).catch(onRejection);
      };

      /**
       * @param toRemove
       * @returns {Promise}
       */
      this.remove = function(toRemove) {
        return model.rpc.remove(toRemove._id).catch(onRejection);
      };

      /**
       * @returns {Array<String>} indicating which properties this model has defined in it's schema
       */
      this.listPaths = function() {
        return model.rpc.listPaths().catch(onRejection);
      };

      /**
       * @returns {QueryChainable} which has same methods as mongoose.js query. When you chain all query
       *                           conditions, you use exec() to fire the query
       */
      this.query = function() {
        var query = {query: [], indexedByMethods: {}};
        return new QueryChainable(query, function() {
          var callQuery = function() {
            query.promise = model.rpc.query(query.query).then(function(result) {
              if (query.indexedByMethods.findOne) {
                query.doc = result;
              } else {
                query.docs = result;
              }
            });
          };

          query.exec = callQuery;
          callQuery();

          return query;
        }, model);
      };

      var createLQEventHandler = function(eventName) {
        return function(LQId, doc, isInResult) {
          var LQ = model._LQs[LQId];
          if (LQ) {
            //updateLQ
            LQ['on_' + eventName](doc, isInResult);
            LQ._invokeListeners(eventName, arguments);  //invoking model event

          } else {
            $log.error('Unknown liveQuery calls this clients pub method, LQ id: ' + LQId);
          }
        }
      };

      this.clientRPCMethods = {
        update: createLQEventHandler('update'),
        remove: createLQEventHandler('remove'),
        create: createLQEventHandler('create'),
        push: createLQEventHandler('push')
      };

      /**
       * @param {Object} previousLQ useful when we want to modify a running LQ, pass it after it is stopped
       * @returns {QueryChainable} same as query, difference is that executing this QueryChainable won't return
       *                           promise, but liveQuery object itself
       */
      this.liveQuery = function(previousLQ) {

        previousLQ && previousLQ.stop();

        var LQ = {_model: model, docs: [], count: 0};

        if (typeof Object.defineProperty === 'function') {
          Object.defineProperty(LQ, 'doc', {
            enumerable: false,
            configurable: false,
            get: function() {
              return LQ.docs[0];
            }
          });
        }

        var eventListeners = {
          update: [],
          remove: [],
          create: [],
          push: [],
          init: [],    //is fired when first query result gets back from the server
          any: []
        };
        LQ._invokeListeners = function(which, params) {

          var index = eventListeners[which].length;
          while (index--) {
            eventListeners[which][index].call(LQ, which, params);
          }

          index = eventListeners.any.length;
          while(index--){
          	eventListeners.any[index].call(LQ, which, params);
          }
        };


        /**
         * registers event callback on this model
         * @param {String} evName
         * @param {Function} callback
         * @returns {Number}
         */
        LQ.on = function(evName, callback) {
          return eventListeners[evName].push(callback) - 1;
        };

        /**
         * unregisters previously registered event callback
         * @param {String} evName
         * @param {Number} evId
         * @returns {Boolean} true when event was unregistered, false when not found
         */
        LQ.off = function(evName, evId) {
          if (eventListeners[evName][evId]) {
            delete eventListeners[evName][evId];
            return true;
          } else {
            return false;
          }
        };

        if (typeof previousLQ === 'object') {
          LQ.query = previousLQ.query;
          LQ.indexedByMethods = previousLQ.indexedByMethods;
        } else {
          LQ.query = [];  //serializable query object
          // utility object to which helps when we need to resolve query type and branch our code
          LQ.indexedByMethods = {};
        }

        LQ.getDocById = function(id) {
          var i = LQ.docs.length;
          while (i--) {
            if (LQ.docs[i]._id === id) {
              return LQ.docs[i];
            }
          }
          return null;
        };
        LQ.recountIfNormalQuery = function() {
          if (!LQ.indexedByMethods.count) {
            LQ.count = LQ.docs.length;
          }
        };
        //syncing logic
        LQ.on_create = function(doc, index) {
          LQ.promise.then(function() {
            if (LQ.indexedByMethods.count) {
              LQ.count += 1; // when this is a count query, just increment and call it a day
              return;
            }

            if (isNumber(index)) {
              LQ.docs.splice(index, 0, doc);
            } else {
              LQ.docs.push(doc);
            }
            if (LQ.indexedByMethods.limit < LQ.docs.length) {
              LQ.docs.splice(LQ.docs.length - 1, 1);  // this needs to occur after push of the new doc
            }
            LQ.recountIfNormalQuery();
          });
        };
        LQ.on_push = LQ.on_create;  //used when item is not new but rather just was updated and fell into query results
        /**
         *
         * @param {Object} doc
         * @param {bool|Number} isInResult for count it indicates whether to increment, decrement or leave as is,
         *                   for normal queries can be a numerical index also
         */
        LQ.on_update = function(doc, isInResult) {
          LQ.promise.then(function() {
            if (LQ.indexedByMethods.count) {	// when this is a count query
              if (isNumber(isInResult)) {
                LQ.count += 1;
              } else {
                if (isInResult === false) {
                  LQ.count -= 1;
                }
                if (isInResult === true) {
                  LQ.count += 1;
                }
              }
              return;// just increment/decrement and call it a day
            }

            var i = LQ.docs.length;
            while (i--) {
              var updated;
              if (LQ.docs[i]._id === doc._id) {
                if (isInResult === false) {
                  LQ.docs.splice(i, 1);  //removing from docs
                  return;
                } else {
                  // if a number, then doc should be moved
                  if (isNumber(isInResult)) {	//LQ with sorting
                    if (isInResult !== i) {
                      if (i < isInResult) {
                        LQ.docs.splice(i, 1);
                        LQ.docs.splice(isInResult - 1, 0, doc);
                      } else {
                        LQ.docs.splice(i, 1);
                        LQ.docs.splice(isInResult, 0, doc);
                      }

                    } else {
                      updated = LQ.docs[i];
                      extend(updated, doc);
                    }

                  } else {
                    updated = LQ.docs[i];
                    extend(updated, doc);
                  }

                }

                return;
              }
            }
            //when not found
            if (isInResult) {
              if (isNumber(isInResult)) {	//LQ with sorting
                LQ.docs.splice(isInResult, 0, doc);
              } else {
                LQ.docs.push(doc); // pushing into docs if it was not found by loop
              }
              return;
            }
            $log.error('Failed to find updated document.');
            LQ.recountIfNormalQuery();
          });
        };
        /**
         *
         * @param {String} id
         * @returns {boolean} true when it removes an element
         */
        LQ.on_remove = function(id) {
          LQ.promise.then(function() {
            if (LQ.indexedByMethods.count) {
              LQ.count -= 1;	// when this is a count query, just decrement and call it a day
              return true;
            }

            var i = LQ.docs.length;
            while (i--) {
              if (LQ.docs[i]._id === id) {
                LQ.docs.splice(i, 1);
                LQ.count -= 1;
                return true;
              }
            }
            $log.error('Failed to find deleted document.');

            return false;
          });
        };
        //notify the server we don't want to receive any more updates
        LQ.stop = function() {
          if (isNumber(LQ.index) && model._LQs[LQ.index]) {
            LQ.stopped = true;
            model.rpc.unsubLQ(LQ.index).then(function(succes) {
              if (succes) {
                if (LQ.indexedByMethods.count) {
                  LQ.count = 0;
                } else {
                  LQ.doc = null;
                  LQ.docs = [];
                }
                delete model._LQs[LQ.index];
                delete model._LQsByQuery[LQ._queryStringified];

              }
            });

          } else {
            throw new Error('There must be a valid index property, when stop is called')
          }
        };

        /**
         * @param {Boolean} dontSubscribe when true, no events from socket will be subscribed
         * @returns {Object} live query object with docs property which contains realtime result of the query
         */
        var queryExecFn = function(dontSubscribe) {
          if (!LQ._queryStringified) {
            if (LQ.indexedByMethods.hasOwnProperty('count') && LQ.indexedByMethods.hasOwnProperty('sort')) {
              throw new Error('count and sort must NOT be used on the same query');
            }
            LQ._queryStringified = JSON.stringify(LQ.query);
            if (model._LQsByQuery[LQ._queryStringified] && model._LQsByQuery[LQ._queryStringified].stopped !== true) {
              return model._LQsByQuery[LQ._queryStringified];
            }

            //if previous check did not found an existing query
            model._LQsByQuery[LQ._queryStringified] = LQ;

            lastIndex += 1;

            model._LQs[lastIndex] = LQ;
            LQ.index = lastIndex;

          }

          LQ.promise = model.rpc.liveQuery(LQ.query, LQ.index).then(function(res) {

            if (isNumber(res.count)) {  // this is a count query when servers sends number
              //$log.debug('Count we got back from the server is ' + res.count);

              // this is not assignment but addition on purpose-if we create/remove docs before the initial
              // count is determined we keep count of them inside count property. This way we stay in sync
              // with the real count
              LQ.count += res.count;

            } else {

              var i = res.docs.length;
              LQ.count += i;

              while (i--) {
                LQ.docs[i] = res.docs[i];
              }

            }
            LQ._invokeListeners('init', res);

            if (!dontSubscribe) {
              self.socket.on('disconnect', function() {
                LQ.stopped = true;
              });

              var reExecute = function() {

                LQ.docs = [];
                LQ.count = 0;

                queryExecFn(true);

              };
              if (self.authObj) { //auth obj should be deleted if you need to logout a user
                //when user is authenticated, we want to reexecute after he is reauthenticated
                self.socket.on('authSuccess', reExecute);
              } else {
                //when he is anonymous, reexecute right after reconnect
                self.socket.on('reconnect', reExecute);
              }
            } else {
              LQ.stopped = false;
            }

            return LQ;	//
          }, onRejection);

          return LQ;
        };

        return new QueryChainable(LQ, queryExecFn, model);
      }
    }

    /**
     * loads one model or returns already requested model promise
     * @param {String} name
     * @returns {Promise} which resolves with the model
     */
    self.getModel = function(name) {
      var model = models[name];
      if (model) {
        return model.deferred.promise;
      }

      model = new Model(name);
      models[name] = model;

      self.connectPromise.then(function() {
        var ccName = 'MR-' + name;
        var promises = [
          self.rpcBackend.expose(ccName, model.clientRPCMethods),
          self.rpcBackend.loadChannel(ccName)
        ];

        var resolvePromises = function(chnlPair) {
          model.rpc = chnlPair[1];
          model.deferred.resolve(model);
        };

        $q.all(promises).then(resolvePromises);

        self.socket.on('disconnect', function() {
          console.log("model disconnect");
          model.deferred = $q.defer();
        });

        self.socket.on('reconnect', function() {
          console.log("model reconnect");

          var promises = [
            self.rpcBackend.getClientChannel(ccName).deferred.promise,
            self.rpcBackend.loadChannel(ccName)
          ];

          $q.all(promises).then(resolvePromises);
        });
      });

      return model.deferred.promise;
    };

    /**
     * loads more than one model
     * @param {Array<string>} models
     * @returns {Promise} which resolves with an Object where models are indexed by their names
     */
    self.getModels = function(models) {
      var promises = {};
      var index = models.length;
      while (index--) {
        var modelName = models[index];
        promises[modelName] = self.getModel(modelName);
      }
      return $q.all(promises);
    };

    if (isDefault) {
      defaultBackend = self;
    }

    return self;
  }

  /**
   * simple getter for MRs stored instances
   * @param {String} name
   * @returns {*}
   */

  Moonridge.getBackend = function(name) {
    if (MRs[name]) {
      return MRs[name];
    } else {
      throw new Error('no such Moonridge backend');
    }
  };

  Moonridge.getDefaultBackend = function() {
    return defaultBackend;
  };

  return Moonridge;
}