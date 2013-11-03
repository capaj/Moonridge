var rpc = require('socket.io-rpc');
var mongoose = require('mongoose');
var _ = require('lodash');
var eventNames = require('./schema-events');

var notifySubscriber = function (clientPubMethod) {
    return function (doc, name) {   // will be called by schema's event firing
        clientPubMethod(doc, name);
    }
};

/**
 *
 * @param {Model} model
 * @param {Schema} schema
 * @param {Object} opts
 */
var expose = function (model, schema, opts) {
    var modelName = model.modelName;
    function find(query, limit, skip, populate, lean) {
        if (lean === undefined) {
            lean = false;
        }
        if (populate) {
            return model.find(query).populate(populate).limit(limit).skip(skip).lean(lean).exec();
        } else {
            return model.find(query).limit(limit).skip(skip).lean(lean).exec();
        }
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

    function subscribe(evName) {
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
                
                var evId = schema.on(evName, notifySubscriber(clFns.pub));

                socket.mrEventIds[evName] = evId;
                def.resolve(evId);

            });
            return def.promise;
        } else {
            throw new Error('event must be specified when subscribing to it');
        }

    }

    function subscribeAll() {
        eventNames.forEach(function (name) {
            subscribe(name);
        });
    }

	var channel = {
		find: find,
		//unsubscribe
		unsub: unsubscribe,
		unsubAll: unsubscribeAll,
		findSubAll: function () {
			find.apply(model, arguments);
			subscribeAll();
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


