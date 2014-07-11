angular.module('Moonridge', ['RPC']).factory('$MR', function $MR($rootScope, $rpc, $q, $log, MRMethodsClientValidations) {
    var MRs = {}; //stores instances of Moonridge
    var defaultBackend;

    //Moonridge methods which aren't run against the DB but rather jsut in memory
    var callJustOnce = [
        'findOne',
        'select',
        'count',
        'sort',
        'limit',
        'skip'
    ];
    /**
     * A moonridge pseudo-constructor(don't call it with new keyword)
     * @param {String} name identifying the backend instance
     * @param {Promise} connectPromise should be resolved with an object with following properties:
     *                                  {String} url backend address
     *                                  {Object} hs handshake for socket.io
     * @param isDefault default if true, this backend will be used for any mr-controller, which does not have it defined
     * @returns {Object} Moonridge singleton
     */
    var Moonridge = function (name, connectPromise, isDefault) {
        var MRSingleton;

        if (MRs[name]) {
            return MRs[name];
        } else {
            MRSingleton = {};
            MRs[name] = MRSingleton;
        }

        var models = {};
        MRSingleton.connectPromise = $q.when(connectPromise).then(function (rParams) {
            MRSingleton.socket = $rpc.connect(rParams.url, rParams.hs);
            return MRSingleton.socket;
        });

        MRSingleton.getAllModels = function () {
            $rpc.loadChannel('Moonridge').then(function (mrChnl) {
                mrChnl.getModels().then(function (models) {
//                    TODO call getModel for all models
                });
            });
        };

        /**
         * is used for emulating mongoose query
         * @param {Object} queryMaster
         * @param {Function} execFn which always returns a promise
         * @param {Model} model
         * @constructor
         */
        var QueryChainable = function (queryMaster, execFn, model) {
            var self = this;
            this.exec = execFn;
            this._model = model;

            var APslice = Array.prototype.slice;

            var createMethod = function (method) {
                self[method] = function () {
                    var argsArray = APslice.call(arguments);

                    //perform validation
                    var validationResult = MRMethodsClientValidations[method](argsArray);
                    if (validationResult instanceof Error) {
                        throw validationResult;
                    }
                    var qr = queryMaster.query;

                    if (callJustOnce.indexOf(method) !== -1) {
                        if (queryMaster.indexedByMethods[method]) {

                            var qrIndex = qr.length;
                            while(qrIndex--) {
                                if (qr[qrIndex].mN === method) {
                                    qr.splice(qrIndex, 1);  //remove from query array because
                                }
                            }
                        }

                        queryMaster.indexedByMethods[method] = argsArray; //we shall add it to the options, this object will be used when reiterating on LQ

                    }

                    qr.push({mN: method, args: argsArray});

                    return self;
                };
            };

            for (var method in MRMethodsClientValidations) {
               createMethod(method);
            }

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
            var lastIndex = 0;
            this.name = name;
            this._LQs = {};	// holds all liveQueries on client indexed by numbers starting from 1, used for communicating with the server
            this._LQsByQuery = {};	// holds all liveQueries on client indexed query in json, used for checking if the query does not exist already
            this.deferred = $q.defer();
//            this.methods = rpc;
            this.update = function (toUpdate) {
                delete toUpdate.__v;
                delete toUpdate.$$hashKey;
                return model.rpc.update.apply(this, arguments).catch(onRejection);
            };

            /**
             * deletes a $$hashkey and calls serverside method
             * @param toCreate
             * @returns {Promise}
             */
            this.create = function (toCreate) {
                delete toCreate.$$hashKey;
                return model.rpc.create(toCreate).catch(onRejection);
            };

            /**
             * @param toRemove
             * @returns {Promise}
             */
            this.remove = function (toRemove) {
                return model.rpc.remove(toRemove._id).catch(onRejection);
            };

            /**
             * @returns {Array<String>}
             */
            this.listPaths = function () {
                return model.rpc.listPaths().catch(onRejection);
            };

            /**
             * @returns {QueryChainable} which has same methods as mongoose.js query. When you chain all query
             *                           conditions, you use exec() to fire the query
             */
            this.query = function () {
                var master = {query:[], indexedByMethods: {}};
                var queryChainable = new QueryChainable(master, function () {
                    return model.rpc.query(master.query);
                }, model);

                return queryChainable;
            };

            var createLQEventHandler = function (eventName) {
                return function (LQId, doc, isInResult) {
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
            this.liveQuery = function (previousLQ) {

                previousLQ && previousLQ.stop();

                var LQ = {_model: model};

                var eventListeners = {
                    update: [],
                    remove: [],
                    create: [],
                    push: [],
                    init:[],    //is fired when first query result gets back from the server
                    any: []
                };
                LQ._invokeListeners = function (which, params) {
                    if (which !== 'any') {
                        this._invokeListeners('any', params);
                    }

                    var index = eventListeners[which].length;
                    while(index--) {
                        eventListeners[which][index].call(LQ, params);
                    }
                };


                /**
                 * registers event callback on this model
                 * @param {String} evName
                 * @param {Function} callback
                 * @returns {Number}
                 */
                LQ.on = function (evName, callback) {
                    return eventListeners[evName].push(callback) - 1;
                };

                /**
                 * unregisters previously registered event callback
                 * @param {String} evName
                 * @param {Number} evId
                 * @returns {Boolean} true when event was unregistered, false when not found
                 */
                LQ.off = function (evName, evId){
                    if (eventListeners[evName][evId]) {
                        delete eventListeners[evName][evId];
                        return true;
                    } else {
                        return false;
                    }
                };

                LQ.docs = [];
                if (navigator.userAgent.indexOf('MSIE 8.0') === -1) {
                    Object.defineProperty(LQ, 'doc', {
                        enumerable: false,
                        configurable: false,
                        get: function () {
                            return LQ.docs[0];
                        }
                    });
                }
                LQ.count = 0;
                if (angular.isObject(previousLQ)) {
                    LQ.query = previousLQ.query;
                    LQ.indexedByMethods = previousLQ.indexedByMethods;
                } else {
                    LQ.query = [];  //serializable query object
                    // utility object to which helps when we need to resolve query type and branch our code
                    LQ.indexedByMethods = {};
                }

				LQ.getDocById = function (id) {
					var i = LQ.docs.length;
					while (i--) {
						if (LQ.docs[i]._id === id) {
							return LQ.docs[i];
						}
					}
					return null;
				};
                LQ.recountIfNormalQuery = function () {
                    if (!LQ.indexedByMethods.count) {
                        LQ.count = LQ.docs.length;
                    }
                };
				//syncing logic
				LQ.on_create = function (doc, index) {
					if (LQ.indexedByMethods.count) {
						LQ.count += 1; // when this is a count query, just increment and call it a day
						return;
 					}

					if (angular.isNumber(index)) {
						LQ.docs.splice(index, 0, doc);
					} else {
						LQ.docs.push(doc);
					}
					if (LQ.indexedByMethods.limit < LQ.docs.length) {
						LQ.docs.splice(LQ.docs.length - 1, 1);  // this needs to occur after push of the new doc
					}
                    LQ.recountIfNormalQuery();
                };
				LQ.on_push = LQ.on_create;  //used when item is not new but rather just was updated and fell into query results
				/**
				 *
				 * @param {Object} doc
				 * @param {bool|Number} isInResult for count it indicates whether to increment, decrement or leave as is,
			     * 								   for normal queries can be a numerical index also
				 */
				LQ.on_update = function (doc, isInResult) {
//					console.log("index sent: " + isInResult);
					if (LQ.indexedByMethods.count) {	// when this is a count query
						if (angular.isNumber(isInResult)) {
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
                                if (angular.isNumber(isInResult)) {	//LQ with sorting
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
                                        angular.extend(updated, doc);
                                    }

                                } else {
									updated = LQ.docs[i];
									angular.extend(updated, doc);
								}

                            }

                            return;
                        }
                    }
                    //when not found
                    if (isInResult) {
                        if (angular.isNumber(isInResult)) {	//LQ with sorting
                            LQ.docs.splice(isInResult, 0, doc);
                        } else {
                            LQ.docs.push(doc); // pushing into docs if it was not found by loop
                        }
                        return;
                    }
                    $log.error('Failed to find updated document.');
                    LQ.recountIfNormalQuery();
                };
				/**
				 *
				 * @param {String} id
				 * @returns {boolean} true when it removes an element
				 */
				LQ.on_remove = function (id) {
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
				};
				//notify the server we don't want to receive any more updates
                LQ.stop = function () {
					if (angular.isNumber(LQ.index) && model._LQs[LQ.index] ) {
                        LQ.stopped = true;
                        model.rpc.unsubLQ(LQ.index).then(function (succes) {
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
                 * @returns {Object} live query object
                 */
                var queryExecFn = function () {
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

                    LQ.promise = model.rpc.liveQuery(LQ.query, LQ.index).then(function (res) {

                        if (angular.isNumber(res.count)) {  // this is a count query when servers sends number
                            //$log.debug('Count we got back from the server is ' + res.count);

                            // this is not assignment but addition on purpose-if we create/remove docs before the initial
                            // count is determined we keep count of them inside count property. This way we stay in sync
                            // with the real count
                            LQ.count += res.count;

                        } else {

                            var i = res.docs.length;
                            LQ.count += i;
                            //TODO here we need to merge the result of the query with changes which occured while the
                            // query ran, so we can't just iterate
                            while(i--) {
                                LQ.docs[i] = res.docs[i];
                            }

                        }
                        LQ._invokeListeners('init', res);

                        return LQ;	//
                    }, onRejection);

                    return LQ;
                };

				var queryChainable = new QueryChainable(LQ, queryExecFn, model);

				return  queryChainable;
            }
        }

        /**
         * loads one model
         * @param name
         * @param handshake
         * @returns {Promise} which resolves with the model
         */
		MRSingleton.getModel = function (name, handshake) {
            var model = models[name];
            if (model) {
                return model.deferred.promise;
            }

            model = new Model(name);
            models[name] = model;

            MRSingleton.connectPromise.then(function () {
                var promises = {
                    client: $rpc.expose('MR-' + name, model.clientRPCMethods),
                    server: $rpc.loadChannel('MR-' + name, handshake)
                };


                $q.all(promises).then(function (chnlPair) {
                    model.rpc = chnlPair.server;
                    model.deferred.resolve(model);
                });
            });

			return model.deferred.promise;
		};

        /**
         * loads more than one model
         * @param {Array<string>} models
         * @param handshake
         * @returns {Promise} which resolves with an Object where models are indexed by their names
         */
        MRSingleton.getModels = function (models, handshake) {
            var promises = {};
            var index = models.length;
            while(index--) {
                var modelName = models[index];
                promises[modelName] = MRSingleton.getModel(modelName, handshake);
            }
            return $q.all(promises);
        };

        if (isDefault) {
            defaultBackend = MRSingleton;
        }

        return MRSingleton;
    };
    /**
     * simple getter for MRs stored instances
     * @param {String} name
     * @returns {*}
     */

    Moonridge.getBackend = function (name) {
        if (MRs[name]) {
            return MRs[name];
        } else {
            throw new Error('no such Moonridge backend');
        }
    };

    Moonridge.getDefaultBackend = function () {
        return defaultBackend;
    };

    return Moonridge;
})
/**
 * @ngdoc directive
 * @name Moonridge.directive:mrController
 * @restrict AC
 *
 * @description
 * Will instantiate angular controller when Moonridge model resolves. This way it is possible to work with it instantly
 * without waiting on promises to resolve inside the controller itself.
 *
  */
.directive('mrController', function ($controller, $q, $MR) {
    var onError = function (err) {
        throw new Error("Cannot instantiate mr-controller - error: " + err);
    };
    return {
        scope: true,
        compile: function compile(tEl, tAttrs) {
            return {
                pre: function (scope, iElement, attr, controller) {
                    var ctrlName = attr.mrController;
                    var MR;
                    if (attr.mrBackend) {
                        MR = $MR.getBackend(attr.mrBackend);
                    } else {
                        MR = $MR.getDefaultBackend();
                    }

                    var instantiateAngularCtrl = function (model) {
						scope.$on('$destroy', function() {
							//TODO stop liveQueries
						});
                        var localInj = {
                            $scope: scope
                        };
                        var injName = 'models';
                        if (attr.mrModel) {
                            injName = attr.mrModel;
                        }
                        localInj[injName] = model;
                        var ctrl = $controller(ctrlName, localInj);
                        iElement.children().data('$ngControllerController', ctrl);
                    };

                    if (attr.mrModel && attr.mrModels === undefined) {
                        MR.getModel(attr.mrModel).then(instantiateAngularCtrl, onError);
                    }else if(attr.mrModels && attr.mrModel === undefined){
                        var mNames = attr.mrModels.split(',');
                        MR.getModels(mNames).then(instantiateAngularCtrl, onError);
                    } else {
                        var el = iElement[0].outerHTML;
                        if (attr.mrModels && attr.mrModel) {
                            throw new Error('Cannot have both mr-model and mr-models attributes defined on element: ' + el);
                        } else {
                            throw new Error('No Moonridge models defined on element: ' + el);
                        }
                    }

                }
            };
        }
    }
})
/**
 * @ngdoc directive
 * @name Moonridge.directive:mrRepeat
 * @restrict A
 *
 * @description
 * syntactic sugar on top of ng-repeat directive.
 *
 */
.directive('mrRepeat', function ($compile, mrSpinner) {
    return {
        compile: function compile(tEl, tAttrs) {
            var content = tEl.html();
            tEl.html(mrSpinner);
            return function (scope, el, attr) {
                var repeatExpr = attr.mrRepeat;
                var varName = repeatExpr.split('in ')[1];

                var LQ;
                function onReady(resolveP) {
                    el.removeAttr('mr-repeat');
                    if (LQ) {
                        el.attr('ng-repeat', repeatExpr + '.docs');
                    } else {
                        el.attr('ng-repeat', repeatExpr);
                        scope[varName] = resolveP;   // overwriting the promise on scope with result of the query
                    }

                    el.html(content);
                    $compile(el)(scope);

                    if (LQ && !attr.noStopping) {
                        scope.$on('$destroy', function() {
                            LQ.stop();
//                                console.log("Query " + LQ._queryStringified + ' was stopped automatically.');
                        });

                    }
                }

                scope.$watch(varName, function (nV) {
                    if (nV) {
                        if (nV.promise) {
                            LQ = nV;
                            nV.promise.then(onReady);

                        } else if(nV.then) {
                            nV.then(onReady);
                        }
                    }
                });

            }

        }
    }
}).value('mrSpinner',
'<div class="spinner">'+
    '<div class="rect1"></div>'+
    '<div class="rect2"></div>'+
    '<div class="rect3"></div>'+
    '<div class="rect4"></div>'+
    '<div class="rect5"></div>'+
'</div>');