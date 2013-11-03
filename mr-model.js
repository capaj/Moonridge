var mongoose = require('mongoose');
var exposeMethods = require('./mr-rpc-methods');
var EventBus = require('./schema-events');

/**
 * @param {String} name
 * @param {Schema} schema
 * @param {Object} opts
 * @param {Boolean} opts.readOnly will expose only find and sub/pub methods
 * @param {Function} opts.authFn will be passed to socket.io-rpc as validation function
 * @returns {*}
 * @constructor
 */
module.exports = function MRModel(name, schema, opts) {
    var mgSchema = mongoose.Schema(schema);
    var schemaEvS = new EventBus();
    // Create subscribers hashtable, holds reference to all registered event handlers
    var fireEvent = schemaEvS.fire;
	var unsubscribe = schemaEvS.unsubscribe;

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
			return schemaEvS.subscribe(callback);
        } else {
            throw new Error('Callback is something else than a function');
        }
    });
    schema.method('off', unsubscribe);

	// Create model from schema
    var model = mongoose.model(name, mgSchema);
    exposeMethods(model, schema, opts);
    return model;

};