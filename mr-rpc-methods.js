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

	var subMethod = function (event) {
		var def = when.defer();
		rpc.loadClientChannel(this.socket,'MR-' + modelName, function (socket, clFns) {
			if (event === undefined) {
				var evIds = {};
				eventNames.forEach(function (name) {
					evIds[name] = schema.on(name, notifySubscriber(clFns.pub));
				});
				def.resolve(evIds);
			} else {
				var evId = schema.on(event, notifySubscriber(clFns.pub));
				def.resolve(evId);
			}
		});
		return def.promise;
	};

    var channel = {
        find: function (subscribe) {
            return findMethod.apply(model, arguments);
			subscribe && subMethod();
        },
		//unsubscribe
        unsub: function (id, event) {  //accepts same args as findFn
			return schema.off(id, event);
        },
		//subscribe
        sub: subMethod,
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


