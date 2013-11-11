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
    var mgSchema = new this.Schema(schema);

    var schemaEvS = new EventBus();
    // Create subscribers hashtable, holds reference to all registered event handlers
    var fireEvent = schemaEvS.fire;
	var unsubscribe = schemaEvS.unsubscribe;

    mgSchema.pre('save', function preSave(next) {
        this._wasNew = this.isNew;
        next();
    });

    // Hook `save` post method called after creation/update
    mgSchema.post('save', function postSave(doc) {
        if (doc._wasNew) {
            fireEvent.call(this, 'create');
        } else {
            fireEvent.call(this, 'update');
        }
        return true;
    });

    mgSchema.post('remove', function postRemove(doc) {
        fireEvent.call(this, 'remove');
        console.log('%s has been removed', doc._id);
    });

    // static method for subscribing to events
	var on = function on(event, callback) {
		if (typeof callback == 'function') {
			return schemaEvS.subscribe(event, callback);
		} else {
			throw new Error('Callback is something else than a function');
		}
	};

	mgSchema.static('on', on);
    mgSchema.static('onAll', function (callback) {
		for (var ev in schemaEvS.subscribers) {
			on(ev, callback);
		}
	});
    mgSchema.static('off', unsubscribe);
    // Create model from schema

    var model = this.model(name, mgSchema);

    exposeMethods(model, mgSchema, opts);

    return {model: model, schema: mgSchema};

};