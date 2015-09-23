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
 * @param {Object} [opts.permissions] should look something like:
 																permissions: {
																	C: 1,
																	R: 0,
																	U: 5,
																	D: 5
																}
 * @param {Object} opts.statics will extend the mongoose schema.statics so that you can call this function on your model
 * @param {Function} opts.schemaInit gives you opportunity to use schema before mongoose model is instantiated
 * @returns {Object}
 * @constructor
 */
module.exports = function MRModel(name, schema, opts) {
	opts = opts || {};

	_.assign(schema, {owner: {type: this.Schema.Types.ObjectId, ref: 'user'}});   //user model should have owner field also
	//mongoose schema
	var mgSchema = new this.Schema(schema);

	if (opts.statics) {
		_.extend(mgSchema.statics, opts.statics);
	}

	if (opts.schemaInit) {
		debug('running schemaInit for ' + name);
		opts.schemaInit(mgSchema);
	}

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
	mgSchema.pathPermissions = pathPermissions; // prepared object for handling access control

	var newDocs = [];
	mgSchema.pre('save', function(next) {
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
			mgSchema.emit('create', doc);
		} else {
			mgSchema.emit('update', doc);
		}
		return true;
	});


	mgSchema.post('remove', function postRemove(doc) {
		mgSchema.emit('remove', doc);
	});

	var model = this.model(name, mgSchema);

	var exposeCallback = exposeMethods(model, mgSchema, opts);

	return {
		model: model,
		findByIdAndUpdate: function() {
			var args = arguments;
			return model.findByIdAndUpdate.apply(model, args).then(function(result) {
				mgSchema.emit('update', args[0]);
				return result;
			});
		},
		findByIdAndRemove: function() {
			var args = arguments;
			return model.findByIdAndRemove.apply(model, args).then(function(result) {
				mgSchema.emit('remove', args[0]);
				return result;
			});
		},
		schemaInit: opts.schemaInit,
		schema: mgSchema,
		_exposeCallback: exposeCallback
	};

};