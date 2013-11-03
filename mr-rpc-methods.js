var rpc = require('socket.io-rpc');
var mongoose = require('mongoose');
var _ = require('lodash');
var eventNames = require('./schema-events');

/**
 *
 * @param {Model} model
 * @param {Schema} schema
 * @param {Object} opts
 */
var expose = function (model, schema, opts) {
    var notifySubscriber = function (clientPubMethod, query) {
        if (query) {
            return function (doc, name) {   // will be called by schema's event firing

                model.findOne(query).where('_id').equals(doc._id).select('_id')
                    .exec(function(err, id) {
                        if (!err && id) {
                            clientPubMethod(doc, name);
                        }
                    });
            }
        } else {
            return function (doc, name) {   // will be called by schema's event firing
                clientPubMethod(doc, name);
            }
        }

    };

    var modelName = model.modelName;
    function makeFindQueries(qBase, limit, skip, populate, lean) {
        if (lean === undefined) {
            lean = false;
        }
        var query;
        if (populate) {
            query = model.find(qBase).populate(populate).limit(limit).skip(skip).lean(lean);
        } else {
            query = model.find(qBase).limit(limit).skip(skip).lean(lean);
        }
        return query;
    }

    function unsubscribe(id, event) {  //accepts same args as findFn
        var res = schema.off(id, event);
        if (res) {
            delete this.socket.mrEventIds[event];
        }
        return res;
    }

    /**
     * @param {Socket} socket
     */
    function unsubscribeAll(socket) {
        var soc = socket || this.socket;
        var mrEventIds = soc.mrEventIds;
        for (var eN in mrEventIds) {
            unsubscribe(mrEventIds[eN], eN);
        }
    }

    function subscribe(evName, query) {
        if (evName) {
            var socket = this.socket;
            if (!socket.mrEventIds) {
                socket.mrEventIds = {};
                socket.on('disconnect', function () {
                    unsubscribeAll(socket);
                });
            }
            var existing = this.socket.mrEventIds;
            if (existing && existing[evName]) {
                // event already subscribed, we don't want to support more than 1 remote listener so we unregister the old one
                unsubscribe(existing[evName], evName);
            }

            var def = when.defer();

            rpc.loadClientChannel(socket, 'MR-' + modelName, function (socket, clFns) {
                
                var evId = schema.on(evName, notifySubscriber(clFns.pub, query));

                socket.mrEventIds[evName] = evId;
                def.resolve(evId);

            });
            return def.promise;
        } else {
            throw new Error('event must be specified when subscribing to it');
        }

    }

    function subscribeAll(query) {
        eventNames.forEach(function (name) {
            subscribe(name, query);
        });
    }
    var queries = {};
	var channel = {
		find: function (qBase, limit, skip, populate, lean) {
            var q = makeFindQueries.apply(model, arguments);
            return q.exec();
        },
		//unsubscribe
		unsub: unsubscribe,
		unsubAll: unsubscribeAll,
        /**
         *
         * @param qBase object to be used as a param for find() method
         * @param {Number} limit
         * @param {Number} skip
         * @param {Boolean} populate
         * @param lean
         * @returns {Promise} from mongoose query
         */
        liveQuery: function (qBase, limit, skip, populate, lean) {
            var query = makeFindQueries.apply(model, arguments);
            subscribeAll(query);
            return query.exec();
        },
		//subscribe
		sub: subscribe,
		subAll: subscribeAll,
		populate: model.populate
	};

	if (opts.readOnly !== true) {
		_.extend(channel, {
			create: function (newDoc) {
				return model.create(newDoc);
//				var def = when.defer();
//				var lang = new model(newDoc);
//				lang.save(function (err, savedDoc) {
//					if (err) {
//						console.error("Document " + newDoc.toJSON() + " failed to save, error: " + err);
//						def.reject(err);
//					} else {
//						console.log("Following document was succesfully saved:" + savedDoc);
//						def.resolve(savedDoc);
//					}
//				});
//				return def.promise;
			},
			remove: function (toRemove) {
				return model.remove(toRemove).exec();
			},
			update: function (toUpdate, multi) {
				if (typeof multi === 'undefined') {
					multi = false;
				}

				var id = toUpdate._id;
				delete toUpdate._id;
				return model.update({ _id: id }, toUpdate, {multi: multi}).exec();
			}
		});
	}
    rpc.expose('MR-' + modelName, channel, opts.authFn)
};

module.exports = expose;


