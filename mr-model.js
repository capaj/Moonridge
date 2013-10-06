var mongoose = require('mongoose');
var exposeMethods = require('./mr-rpc-methods');

module.exports = function MRModel(name, schema) {
    var mgSchema = mongoose.Schema(schema);

    // Create subscribers collection
    var subscribers = {
        create: [],
        update: [],
        remove: []
    };

    var fireCallbacks = function (arr) {
        for (var i in arr) {
            arr[i](this);   // TODO decide if doc or this
        }
    };

    schema.pre('save', function (next) {
        this._wasNew = this.isNew;
        console.log("presave");
        next();
    });

    // Hook `save` post method called after creation/update
    schema.post('save', function (doc) {
        if (this._wasNew) {
            fireCallbacks.call(this, subscribers.create);
        } else {
            fireCallbacks.call(this, subscribers.update);
        }
        return true;
    });

    schema.post('remove', function (doc) {
        fireCallbacks.call(this, subscribers.remove);
        console.log('%s has been removed', doc._id);
    });

    // Add static method to schema for subscribing
    // should be used by queries and
    schema.static('sub', function subscribe (subscriber, event) {
        if (typeof subscriber == 'function') {
            var unrFn;
            if (event) {
                var length = subscribers[event].push(subscriber);
                var unregistered = false;
                unrFn = function () {
                    if (!unregistered) {
                        subscribers.slice(length-1);
                        unregistered = true;
                        return true;
                    }
                    return false;
                }
            } else {
                unrFn = [];
                for(var anEvent in subscribers){
                    unrFn.push( subscribe(subscriber, anEvent) );
                }
            }
            return unrFn;
        } else {
            console.error("Subscribing something else than a function> " + subscriber);
        }
        return false;
    });

    schema.method('unsub', function (obj) {
        //todo implement
    });
// Create model from schema
    var model = mongoose.model(name, mgSchema);
    exposeMethods(model);
    return model;

};