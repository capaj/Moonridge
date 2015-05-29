var exposeMethods = require('./mr-rpc-methods');
var EventEmitter = require("events").EventEmitter;
var debug = require('debug')('moonridge:server');
var _ = require('lodash');
/**
 * @param {String} name
 * @param {Schema} schema NOTE: don't use these properties on your schemas: '$$hashKey', '__id', '__v', those names are
 * reserved for angular and Mongoose
 * @param {Object} opts
 * @param {Boolean} opts.readOnly will expose only find and sub/pub methods
 * @param {Object} opts.permissions should look something like:
 * 		example: {
			C: 1,
			R: 0,
			U: 5,
			D: 5
		}
 * @param {Object} opts.statics will extend the mongoose schema.statics so that you can call this function on your model
 * @param {Function} opts.authFn will be passed to socket.io-rpc as authorization function for the whole model channel
 * @param {Function} opts.schemaInit gives you opportunity to use schema before mongoose model is instantiated
 * @returns {*}
 * @constructor
 */
module.exports = function MRModel(name, schema, opts) {
    opts = opts || {};

    _.assign(schema, {owner: { type: this.Schema.Types.ObjectId, ref: 'user' }});   //user model should have owner field also
    //mongoose schema
    var mgSchema = new this.Schema(schema);

    if (opts.statics) {
        _.extend(mgSchema.statics, opts.statics);
    }

	var schemaInit = function() {
		if (opts.schemaInit) {
			debug('schemaInit for ' + name);
			opts.schemaInit(mgSchema);
		}
	};

	schemaInit();

    var paths = mgSchema.paths;
    var pathPermissions = {};
    for (var prop in paths) {
        if (paths[prop].options) {
            var perm = paths[prop].options.permissions; // looks like {R: 10, W: 20}
            if (perm) {
                pathPermissions[prop] = perm;
            }
        }
    }
    mgSchema.pathPermissions = pathPermissions; // prepared object for handling access controll

    var invokeCUDEvent = function(evName, doc) {
        mgSchema.emit(evName, doc);
        mgSchema.emit('CUD', evName, doc);
    };

    var newDocs = [];
    mgSchema.pre('save', function (next) {
        if (this.isNew) {
            newDocs.push(this._id);
        }
        next();
    });

    // Hook `save` post method called after creation/update
    mgSchema.post('save', function postSave(doc) {
		var indexInNewDocs = newDocs.indexOf(doc._id);
        if (indexInNewDocs !== -1) {
            newDocs.splice(indexInNewDocs, 1);
            invokeCUDEvent('create', doc);
        } else {
            invokeCUDEvent('update', doc);
        }
        return true;
    });


	mgSchema.post('remove', function postRemove(doc) {
        invokeCUDEvent('remove', doc);
//        console.log('%s has been removed', doc._id);
    });

    var model = this.model(name, mgSchema);

    var exposeCallback = exposeMethods(model, mgSchema, opts);

    return {
		model: model,
		reInitialize: schemaInit,
		schema: mgSchema,
		_exposeCallback: exposeCallback
	};

};