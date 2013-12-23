var rpc = require('socket.io-rpc');
var _ = require('lodash');
var when = require('when');
var eventNames = require('./schema-events').eventNames;
var queryBuilder = require('./query-builder');
var populateWithClientQuery = require('./utils/populate-doc-util');
var maxLQsPerClient = 100;
/**
 *
 * @param {Model} model Moonridge model
 * @param {Schema} schema mongoose schema
 * @param {Object} opts
 */
var expose = function (model, schema, opts) {
    var liveQueries = {};
    opts = opts || {};
    var modelName = model.modelName;
    var queryValidation = function (callback) {
        callback(true);
    };

    /**
     * similar purpose as accesControlQueryModifier but works not on query, but objects, usable whenever we are sending
     * new doc to client without querying
     * @param {Object} doc just JS object, not a real mongoose doc
     * @param {String} op operation, 'R' or 'W'
     * @param {Number} userPL privilige level of the current user
     * @returns {*}
     */
    function deleteUnpermittedProps(doc, op, userPL) {
        var pathPs = schema.pathPermissions;
        var doc = _.clone(doc);

        for (var prop in pathPs) {
            var perm = pathPs[prop];
            if (perm[op] && perm[op] > userPL) {
                delete doc[prop];
            }
        }
        return doc;
    }

    var getIndexInSorted = require('./utils/indexInSortedArray');

    model.onCUD(function (mDoc, evName) {   // will be called by schema's event firing
        var doc = mDoc.toObject();
        Object.keys(liveQueries).forEach(function (LQString) {
            var LQ = liveQueries[LQString];
            var cQindex = LQ.getIndexById(doc._id); //index of current doc in the query

            if (evName === 'remove' && LQ.docs[cQindex]) {

                LQ.docs.splice(cQindex, 1);
                LQ.callClientListeners(doc, evName, false);

                if (LQ.clientQuery.limit) {
                    model.find(LQ.mQuery).lean().skip((LQ.clientQuery.skip || 0) + LQ.clientQuery.limit - 1).limit(1)
                        .exec(function(err, docArr) {
                            if (docArr.length === 1) {
                                var toFillIn = docArr[0];   //TODO check if this index is correct
                                if (toFillIn) {
                                    LQ.docs.push(toFillIn);
                                    LQ.callClientListeners(toFillIn, 'push');
                                }
                            }

                        }
                    );

                }

            } else {
                var checkQuery = model.findOne(LQ.mQuery);
                checkQuery.where('_id').equals(doc._id).select('_id').exec(function(err, id) {
                        if (err) {
                            console.error(err);
                        }
                        if (id) {
                            var qDoc;
                            if (LQ.clientQuery.populate) {
                                qDoc = mDoc;   //if query has populate utilised, then we have to use the result from checkQuery as a doc
                            } else {
                                qDoc = doc;
                            }
                            if (LQ.clientQuery.sort) {
                                var sortBy = LQ.clientQuery.sort.split(' ');	//check for string is performed on query initialization
                                var index;
                                if (evName === 'create') {
                                    index = getIndexInSorted(qDoc, LQ.docs, sortBy);
                                    LQ.docs.splice(index, 0, qDoc);
                                    if (LQ.docs.length > LQ.clientQuery.limit) {
                                        LQ.docs.splice(LQ.docs.length - 1, 1);

                                    }
                                }
                                if (evName === 'update') {
                                    index = getIndexInSorted(qDoc, LQ.docs, sortBy);

                                    if (cQindex === -1) {
                                        LQ.docs.splice(index, 0, qDoc);    //insert the document
                                    } else {
                                        if (cQindex !== index) {
                                            if (cQindex < index) {  // if we remove item before, the whole array shifts, so we have to compensate index by 1.
                                                LQ.docs.splice(cQindex, 1);
                                                LQ.docs.splice(index - 1, 0, qDoc);
                                            } else {
                                                LQ.docs.splice(cQindex, 1);
                                                LQ.docs.splice(index, 0, qDoc);
                                            }

                                        } else {
                                            LQ.docs[index] = qDoc;
                                        }
                                    }

                                }
                                if (_.isNumber(index)) {
                                    LQ.callClientListeners(qDoc, evName, index);
                                }

                            } else {
                                if (evName === 'create') {
                                    LQ.docs.push(qDoc);
                                    LQ.callClientListeners(qDoc, evName, null);
                                }
                                if (evName === 'update') {
                                    if (cQindex === -1) {
                                        LQ.docs.push(qDoc);
                                        LQ.callClientListeners(qDoc, evName, true);	//doc wasn't in the result, but after update is

                                    } else {
                                        LQ.callClientListeners(qDoc, evName, null);	//doc is still in the query result on the same index

                                    }
                                }

                            }
                        } else {
                            if (evName === 'update' && cQindex !== -1) {
                                LQ.docs.splice(cQindex, 1);
                                LQ.callClientListeners(doc, evName, false);		//doc was in the result, but after update is no longer
                            }
                        }
                    }
                );
            }
        });

    });

    var notifySubscriber = function (clientPubMethod) {
        return function (doc, evName) {   // will be called by schema's event firing
            clientPubMethod(doc, evName);
        }

    };

    function unsubscribe(id, event) {  //accepts same args as findFn
        var res = model.off(id, event);
        if (res) {
            delete this.mrEventIds[event];
        }
        return res;
    }

    /**
     * @param {Socket} socket
     */
    function unsubscribeAll(socket) {
        var soc = socket || this;
        var mrEventIds = soc.mrEventIds;
        for (var eN in mrEventIds) {
            unsubscribe.call(soc, mrEventIds[eN], eN);
        }
    }

    function subscribe(evName) {
        if (evName) {
            var socket = this;
            if (!socket.mrEventIds) {
                socket.mrEventIds = {};

                socket.on('disconnect', function () {
                    unsubscribeAll(socket);
                });
            }
            var existing = this.mrEventIds;
            if (existing && existing[evName]) {
                // event already subscribed, we don't want to support more than 1 remote listener so we unregister the old one
                unsubscribe(existing[evName], evName);
            }

            var clFns = socket.cRpcChnl;

            var evId = model.on(evName, notifySubscriber(clFns.pub, socket));

            socket.mrEventIds[evName] = evId;

            return evId;
        } else {
            throw new Error('event must be specified when subscribing to it');
        }

    }

    function subscribeAll(query) {
        var evIds = {};
        var socket = this;
        eventNames.forEach(function (name) {
            evIds[name] = subscribe.call(socket, name, query);
        });
        return evIds;
    }

    /**
     *
     * @param {String} op operation to check, can be 'C','R', 'U', 'D'
     * @param socketContext
     * @param {Document} [doc]
     * @returns {bool} true when user has permission, false when not
     */
    opts.checkPermission = function (socketContext, op, doc) {
        var PL; //privilige level
        try{
            PL = socketContext.manager.user.privilige_level;
        }catch(e){
            PL = 0;
        }

        if (doc && op !== 'C') {   //if not creation, with creation
            if (doc.owner.toString() === socketContext.manager.user._id.toString()) {
                return true;    // owner does not need any permissions
            }
        }

        if (this.permissions && this.permissions[op]) {
            if (PL < this.permissions[op]) {
                return false;
            }
        }
        return true;
    };

    /**
     *  This function should always modify the query so that no one sees properties that they are not allowed to see
     * @param {Object} clQuery object parsed from stringified argument
     * @param {Schema} schema mongoose schema
     * @param {Number} userPL user privilege level
     * @param {String} op
     * @returns {Object}
     */
    function accesControlQueryModifier(clQuery, schema, userPL, op) { // gives us
        var pathPs = schema.pathPermissions;

        var select = clQuery.select || {};  //overriding clQuery select field to adhere to permissions
        if (_.isString(select)) {
            //in this case, we need to parse the string and return the object notation
            var props = select.split(' ');
            var i = props.length;
            while(i--){
                var clProp = props[i];
                if (clProp[0] === '-') {
                    clProp = clProp.substr(1);
                    select[clProp] = 0;
                } else {
                    select[clProp] = 1;
                }
            }
        }
        for (var prop in pathPs) {
            var perm = pathPs[prop];
            if (perm[op] && perm[op] > userPL) {
                select[prop] = 0;
            }
        }

        clQuery.select = select; //after modifying the query, we just
        return clQuery;
    }

    /**
     * @param {String} qKey
     * @param {Mongoose.Query} mQuery
     * @param {Object} clientQuery
     * @returns {Object}
     * @constructor
     */
    function LiveQuery(qKey, mQuery, clientQuery) {
        this.docs = [];
        this.listeners = {};
        this.mQuery = mQuery;   //mongoose query
        this.qKey = qKey;
        this.clientQuery = clientQuery; //serializable client query object
        return this;
    }

    LiveQuery.prototype =  {
        destroy: function () {
            delete liveQueries[this.qKey];
        },
        /**
         *
         * @param {Document.Id} id
         * @returns {Number}	-1 when not found
         */
        getIndexById: function (id) {
            id = id.id;
            var i = this.docs.length;
            while(i--)
            {
                var doc = this.docs[i];
                if (doc && doc._id.id === id) {
                    return i;
                }
            }
            return i;
        },
        /**
         *
         * @param {Object|Mongoose.Document} doc
         * @param {String} evName
         * @param {Boolean|Number|null} isInResult when number, indicates an index where the doc should be inserted
         */
        callClientListeners: function (doc, evName, isInResult) {
            var self = this;
            if (this.clientQuery.populate && doc.populate) {
                populateWithClientQuery(doc, this.clientQuery.populate, function (err, populated) {
                    self._distributeChange(populated.toObject(), evName, isInResult);
                });

            } else {
                self._distributeChange(doc, evName, isInResult);
            }

        },
        _distributeChange: function (doc, evName, isInResult) {
            for (var socketId in this.listeners) {
                var listener = this.listeners[socketId];
                var toSend = null;
                if (listener.qOpts.count) {
                    // we don't need to send a doc when query is a count query
                } else {
                    if (evName === 'remove') {
                        toSend = doc._id.toString();	//remove needs only _id
                    } else {
                        toSend = doc;
                    }
                }

                var uP = listener.socket.manager.user.privilige_level;
                toSend = deleteUnpermittedProps(toSend, 'R', uP);
                listener.rpcChannel.pubLQ(toSend, evName, listener.clIndex, isInResult);
            }
        },
        /**
         * removes a socket listener from liveQuery
         * @param socket
         */
        removeListener: function (socket) {
            if (this.listeners[socket.id]) {
                delete this.listeners[socket.id];
                if (Object.keys(this.listeners).length === 0) {
                    this.destroy()
                }
            } else {
                return new Error('no listener present on');
            }
        }
    };

    function validateClientQuery(clientQuery) {	//errors are forwarded to client
        //TODO check query for user priviliges
        if (clientQuery && clientQuery.sort && !_.isString(clientQuery.sort)) {
            throw new Error('only string notation for sort method is supported for liveQueries');
        }
    }


    var channel = {
        /**
         *
         * @param clientQuery
         * @returns {Promise}
         */
        find: function (clientQuery) {
            accesControlQueryModifier(clientQuery,schema, this.manager.user.privilige_level, 'R');
            clientQuery.lean = true; // this should make query always lean
            var mQuery = queryBuilder(model, clientQuery);
            return mQuery.exec();
        },
        //unsubscribe
        unsub: unsubscribe,
        unsubAll: unsubscribeAll,
        unsubLQ: function (index) {	//when client uses stop method on LQ, this method gets called
            var LQ = this.registeredLQs[index];
            if (LQ) {
                delete this.registeredLQs[index];
                LQ.removeListener(this);
                return true;
            } else {
                return new Error('Index param in LQ unsubscribe is not valid!');
            }
        },
        /**
         *
         * @param {Object} clientQuery object to be parsed by queryBuilder, consult mongoose query.js docs for reference
         * @returns {Promise} from mongoose query, resolves with an array of documents
         */
        liveQuery: function (clientQuery) {
            try{
                validateClientQuery(clientQuery);
            }catch(e){
                return e;
            }
            if (!opts.checkPermission(this, 'R')) {
                return new Error('You lack a privilege to read this document');
            }
            if (!clientQuery) {
                clientQuery = {};
            }
            def = when.defer();
            if (!clientQuery.count) {
                accesControlQueryModifier(clientQuery, schema, this.manager.user.privilige_level, 'R');
            }

            var queryOptions = {};
            var moveParamToQueryOptions = function (param) {
                if (clientQuery.hasOwnProperty(param)) {
                    queryOptions[param] = clientQuery[param];
                    delete clientQuery[param];
                }
            };
            moveParamToQueryOptions('count');	//for serverside purposes count is useless

            try{
                var mQuery = queryBuilder(model, clientQuery);
            }catch(e){
                return e;   //building of the query failed
            }

            if (!mQuery.exec) {
                return new Error('query builder has returned invalid query');
            }
            var socket = this;

            var qKey = JSON.stringify(clientQuery);
            var LQ = liveQueries[qKey];
            var def;

            var pushListeners = function (LQOpts) {
                socket.clientChannelPromise.then(function (clFns) {
                    var activeClientQueryIndexes = Object.keys(socket.registeredLQs);
                    var lastIndex = activeClientQueryIndexes[activeClientQueryIndexes.length-1];
                    if (!lastIndex) {
                        lastIndex = 0;
                    } else {
                        if (activeClientQueryIndexes.length > maxLQsPerClient) {
                            def.reject(new Error('Limit for queries per client reached. Try stopping some queries.'));
                            return;
                        }
                    }
                    var clIndex = Number(lastIndex) + 1;
                    socket.registeredLQs[clIndex] = LQ;

                    LQ.listeners[socket.id] = {rpcChannel: clFns, socket: socket, clIndex: clIndex, qOpts: LQOpts};

                    LQ.firstExecPromise.then(function (queryResult) {
                        var retVal;
                        if (LQOpts.hasOwnProperty('count')) {
                            retVal = {count: queryResult.length, index: clIndex};
                        } else {
                            if (Array.isArray(queryResult)) {
                                retVal = {docs: queryResult, index: clIndex};
                            } else {
                                retVal = {doc: queryResult, index: clIndex};
                            }
                        }

                        def.resolve(retVal);
                    });


                }, function (err) {
                    def.reject(err);
                });

            };
            if (LQ) {
                pushListeners(queryOptions);
            } else {
                LQ = new LiveQuery(qKey, mQuery, clientQuery);
                liveQueries[qKey] = LQ;

                LQ.firstExecPromise = mQuery.exec().then(function (rDocs) {
                    if (clientQuery.hasOwnProperty('findOne')) {
                        liveQueries[qKey].docs = [rDocs];
                    } else {
                        var i = rDocs.length;
                        while(i--)
                        {
                            liveQueries[qKey].docs[i] = rDocs[i];
                        }
                    }

                    pushListeners(queryOptions);

                    return rDocs;

                });
            }
            return def.promise;
        },
        //TODO have a method to stop and resume liveQuery
        //subscribe
        sub: subscribe,
        subAll: subscribeAll,
        populate: model.populate
    };

    if (opts && opts.readOnly !== true) {
        _.extend(channel, {
            create: function (newDoc) {
                if (!opts.checkPermission(this, 'C')) {
                    return new Error('You lack a privilege to create this document');
                }
                deleteUnpermittedProps(newDoc, 'W', this.manager.user.privilige_level);
                if (schema.paths.owner) {
                    //we should set the owner field if it is present
                    newDoc.owner = this.manager.user._id;
                }
                return model.create(newDoc);

            },
            remove: function (id) {

                var def = when.defer();
                var socket = this;
                model.findById(id, function (err, doc) {
                    if (err) {
                        def.reject(new Error('Error occured on the findById query'));
                    }
                    if (doc) {
                        if (opts.checkPermission(socket, 'D', doc)) {
                            doc.remove(function (err) {
                                if (err) {
                                    def.reject(err);
                                }
                                def.resolve();
                            });
                        } else {
                            def.reject(new Error('You lack a privilege to delete this document'));
                        }
                    } else {
                        def.reject(new Error('no document to remove found with _id: ' + id));
                    }
                });
                return def.promise;
            },
            update: function (toUpdate) {

                var uPL = this.manager.user.privilige_level;
                var def = when.defer();
                var socket = this;
                var id = toUpdate._id;
                delete toUpdate._id;
                delete toUpdate.__v;
                model.findById(id, function (err, doc) {
                    if (doc) {
                        if (opts.checkPermission(socket, 'U', doc)) {
                            deleteUnpermittedProps(toUpdate, 'W', uPL);
                            var previousVersion = doc.toObject();
                            _.extend(doc, toUpdate);
                            doc.__v += 1;
                            schema.eventBus.fire.call(doc, 'preupdate', previousVersion);

                            doc.save(function (err) {
                                if (err) {
                                    def.reject(err);
                                }
                                def.resolve();
                            });
                        } else {
                            def.reject(new Error('You lack a privilege to update this document'));
                        }

                    } else {
                        def.reject(new Error('no document to update found with _id: ' + id));
                    }
                });
                return def.promise;
            }
        });
    }
    var authFn = opts && opts.authFn;
    var exposeCallback = function () {
        var chnlSockets = rpc.expose('MR-' + modelName, channel, authFn);
        chnlSockets.on('connection', function (socket) {

            socket.clientChannelPromise = rpc.loadClientChannel(socket, 'MR-' + modelName).then(function (clFns) {
                socket.cRpcChnl = clFns;	// client RPC channel
                return clFns;
            });
            socket.registeredLQs = [];
            socket.on('disconnect', function() {
                //clearing out liveQueries listeners
                for (var LQId in socket.registeredLQs) {
                    var LQ = socket.registeredLQs[LQId];
                    LQ.removeListener(socket);
                }
            });
        });
    };
    return exposeCallback;

};

module.exports = expose;


