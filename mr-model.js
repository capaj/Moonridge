var mongoose = require('mongoose');
var exposeMethods = require('./mr-rpc-methods');
var IdGen = require('./simple-ids');


module.exports = function MRModel(name, schema, authFn) {
    var mgSchema = mongoose.Schema(schema);

    // Create subscribers hashtable, holds reference to all registered event handlers
    var eventNames = require('./schema-events');
    var subscribers = {};	//TODO use node-hashtable here for better perf
	eventNames.forEach(function (name) {
		subscribers[name] = {};
	});

    var fireEvent = function (name) {
        var evObj = subscribers[name];
        for (var i in evObj) {
            evObj[i](this, name);
        }
    };

	var unsubscribe = function (id, event) {
		if (event) {
			if (Array.isArray(event)) {
				var unsubscribed = {};
				event.forEach(function (evName) {
					unsubscribed[evName] = unsubscribe(id, evName);
				});
				return unsubscribed;
			} else {
				if (subscribers[event][id]) {
					delete subscribers[event][id];
					return true;
				} else {
					return false;
				}
			}
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

    // static method for subscribing to events
    schema.static('on', function on (event, callback) {
        if (typeof callback == 'function') {
			var newId = IdGen();
			subscribers[event][newId] = callback;
			return newId;
        } else {
            throw new Error('Callback is something else than a function');
        }
    });
    schema.method('off', unsubscribe);

	// Create model from schema
    var model = mongoose.model(name, mgSchema);
    exposeMethods(model, schema, authFn);
    return model;

};