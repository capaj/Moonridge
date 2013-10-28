var mongoose = require('mongoose');
var exposeMethods = require('./mr-rpc-methods');

module.exports = function MRModel(name, schema) {
    var mgSchema = mongoose.Schema(schema);

    // Create subscribers hashmap, holds reference to all registered event handlers
    var subscribers = {
        create: {},
        update: {},
        remove: {}
    };

    var fireEvent = function (name) {
        var evObj = subscribers[name];
        for (var i in evObj) {
            evObj[i](this, name);
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
            fireEvent.call(this, 'create');
        } else {
            fireEvent.call(this, 'update');
        }
        return true;
    });

    schema.post('remove', function (doc) {
        fireEvent.call(this, 'remove');
        console.log('%s has been removed', doc._id);
    });

    // Add static method to schema for subscribing
    // should be used by queries and
    schema.static('on', function on (event, callback) {
        if (typeof callback == 'function') {
            var unrFn;
            if (event) {
                var length = subscribers[event].push(callback);
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
                    unrFn.push( subscribe(callback, anEvent) );
                }
            }
            return unrFn;
        } else {
            throw new Error('Callback is something else than a function');
        }
        return false;
    });

    schema.method('unsub', function (obj) {
        //todo implement
    });
// Create model from schema
    var model = mongoose.model(name, mgSchema);
    exposeMethods(model, schema);
    return model;

};