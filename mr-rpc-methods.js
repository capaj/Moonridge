var rpc = require('socket.io-rpc');
var mongoose = require('mongoose');
var runDate = new Date();
var eventNames = require('./schema-events');

var notifySubscriber = function (clientPubMethod) {
    return function (doc, name) {   // will be called by schema's event firing
        clientPubMethod(doc, name);
    }
};

var expose = function (modelName, schema) {
    var model = mongoose.models[modelName];
    var findMethod = function (query, limit, skip, populate, lean) {
        if (lean === undefined) {
            lean = false;
        }
        if (populate) {
            return channel.find(query).populate(populate).limit(limit).skip(skip).lean(lean).exec();
        } else {
            return channel.find(query).limit(limit).skip(skip).lean(lean).exec();
        }
    };

    var regEvent = function (evName, callback) {

    };

    var unsubscribe = function (id, event) {  //accepts same args as findFn
        var res = schema.off(id, event);
        if (res) {
            delete this.socket.mrEventIds[event];
        }
        return res;
    };

    var unsubscribeAll = function (socket) {
        var soc = socket || this.socket;
        var mrEventIds = soc.mrEventIds;
        for (var eN in mrEventIds) {
            unsubscribe(mrEventIds[eN], eN);
        }

    };

    var subscribe = function (evName) {
        if (evName) {
            var existing = this.socket.mrEventIds;
            if (existing && existing[evName]) {
                // event already subscribed, we don't want to support more than 1 remote listener so we unregister the old one
                unsubscribe(existing[evName], evName);
            }

            var def = when.defer();
            rpc.loadClientChannel(this.socket, 'MR-' + modelName, function (socket, clFns) {

                var evId = schema.on(evName, notifySubscriber(clFns.pub));
                if (!socket.mrEventIds) {
                    socket.mrEventIds = {};
                }
                socket.mrEventIds[evName] = evId;
                def.resolve(evId);

            });
            return def.promise;
        } else {
            throw new Error('event must be specified when subscribing to it');
        }

    };

    var subscribeAll = function () {
        eventNames.forEach(function (name) {
            subscribe(name);
        });
    };
    var channel = {
        find: function (alsoSubscribe) {
            return findMethod.apply(model, arguments);
			alsoSubscribe && subscribeAll();
        },
		//unsubscribe
        unsub: unsubscribe,
        unsubAll: unsubscribeAll,
		//subscribe
        sub: subscribe,
        subAll: subscribeAll,
        create: function (model, newDoc) {
            var def = when.defer();
            var lang = new model(newDoc);
            lang.save(function (err, savedDoc) {
                if (err) {
                    console.error("Document "+ newDoc.toJSON() + " failed to save, error: " + err);
                    def.reject(err);
                }else{
                    console.log("Following document was succesfully saved:" + savedDoc);
                    def.resolve(savedDoc);
                }
            });
            return def.promise;
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
    };
    rpc.expose('MR-' + modelName, channel)
};

module.exports = expose;


