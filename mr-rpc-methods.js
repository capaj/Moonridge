var rpc = require('socket.io-rpc');
var mongoose = require('mongoose');
var runDate = new Date();

var publish = function (socket) {
    //TODO implement
};

var expose = function (modelName) {
    var model = mongoose.models[modelName];
    var findFn = function (query, limit, skip, populate, lean) {
        if (lean === undefined) {
            lean = false;
        }
        if (populate) {
            return channel.find(query).populate(populate).limit(limit).skip(skip).lean(lean).exec();
        } else {
            return channel.find(query).limit(limit).skip(skip).lean(lean).exec();
        }
    };

    var channel = {
        find: function () {
            return findFn.apply(model, arguments);
        },
        findThenSub: function () {  //accepts same args as findFn
            return findFn.apply(this, arguments).then(function (dbObjects) {
                var iter = dbObjects.length;
                while(iter--) {
                    dbObjects[iter].sub(publish(this)); // TODO add method for subscribing on models
                }
            });
        },
        sub: function (id) {
            model.findById(id).then(function (doc) {
                doc.sub(publish(this));
            }, function (err) {
                console.error("while subscribing to model " + id + " error occured: " + err);
            })
        },
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
        delete: function (toRemove) {
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


