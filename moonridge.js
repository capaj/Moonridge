var RPC = require('socket.io-rpc');
var _ = require('lodash');
var debug = require('debug')('moonridge:server');
var MRModel = require('./mr-server-model');
var userModel;

var express = require('express');
var models = {};
var mongoose = require('mongoose');
/**
 *
 * @param {String} connString to mongoDB
 * @returns {{model: regNewModel, userModel: registerUserModel, authUser: authUser, bootstrap: createServer}} moonridge
 * instance which allows to register models and bootstrap itself
 */
module.exports = function (connString) {

	if (connString) {
		mongoose.connect(connString, function (err) {
			// if we failed to connect, abort
			if (err) {
				throw err;
			} else {
				debug("DB connected succesfully");
			}
		});
		mongoose.connection.on('error', function(err) {
			console.error('MongoDB error: %s', err);
		});
	}

	/**
	 * @param {String} name
	 * @param {Object} schema
	 * @param {Object} opts
	 * @param {Function} opts.checkPermission function which should return true/false depending if the connected socket has/hasn't priviliges
	 * @param {Object} opts.permissions with 4 properties: "C", "R","U", "D" which each represents one type of operation,
	 *                                  values should be numbers indicating which level of privilige is needed

	 * @returns {MRModel}
	 */
	function regNewModel(name, schema, opts) {

		var model = MRModel.apply(mongoose, arguments);
		models[name] = model;
		return model;
	}

	/**
	 *
	 * @param schemaExtend
	 * @param {Object} opts
	 * @returns {MRModel}
	 */
	function registerUserModel(schemaExtend, opts) {

		if (userModel) {    //if it was already assigned, we throw
			throw new Error('There can only be one user model and it was already registered');
		}
		var userSchema = require('./utils/user-model-base');
		_.extend(userSchema, schemaExtend);
		userModel = MRModel.call(mongoose, 'user', userSchema, opts);
		models['user'] = userModel;

		return userModel;
	}

	/**
	 * Shares the same signature as express.js listen method, because it passes arguments to it
	 * @param {Number} port
	 * @param {String} [hostname]
	 * @param {Function} [Callback]
	 * @returns {{rpcNsp: (Emitter), io: {Object}, server: http.Server}}
	 */
	function bootstrap() {
		var server = RPC.apply(null, arguments);
		var io = server.io;

		var allQueries = [];

		Object.keys(models).forEach(function (modelName) {
			var model = models[modelName];
      _.assign(model, model._exposeCallback(server));   //return object containing modelName and liveQueries Object for that model
			console.log("modelName", modelName);

		});

		io.use(function(socket, next) {
			socket.moonridge = {user: {privilege_level: 0}}; //default privilege level for any connected client
			next();
		});

		server.expressApp.get('/MR/models.js', function (req, res){
			res.type('application/javascript; charset=utf-8');
			var modelNames = Object.keys(models);
			var clSideScript = 'module.exports = function(MR) {' +
					'var modelsHash = {};' +
					'var models = ' + JSON.stringify(modelNames) + ';' +
					'models.forEach(function(modelName) {modelsHash[modelName] = MR.model(modelName);});' +
					'return modelsHash;' +
				'};';
			res.send(clSideScript);
			res.end();
		});

		if (server.expressApp.get('env') === 'development') {
			// this reveals any data that you use in queries to the public, so it should not be used in production when dealing with sensitive data

			server.expose({
				MR: {
					getHealth: function() {
						var allModels = {};
						var index = allQueries.length;
						while (index--) {
							var modelQueriesForSerialization = {};
							var model = allQueries[index];
							for (var LQ in model.queries) {
								modelQueriesForSerialization[LQ] = Object.keys(model.queries[LQ].listeners).length;
							}
							allModels[model.modelName] = modelQueriesForSerialization;

						}
						return {
							pid: process.pid,
							memory: process.memoryUsage(),
							uptime: process.uptime(),   //in seconds
							liveQueries: allModels  //key is LQ.clientQuery and value is number of listening clients
						};
					}
				}
			});

		}

		return server;
	}

	return {
		model: regNewModel,
		userModel: registerUserModel,
		bootstrap: bootstrap,
		mongoose: mongoose,
		models: models
	};
};