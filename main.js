var rpc = require('socket.io-rpc');
var _ = require('lodash');
var MRModel = require('./mr-model');
var userModel;
var toCallOnCreate = [];
var logger = require('./logger/logger');
var auth = require('./authentication');

/**
 *
 * @param {Object} mongoose ORM module
 * @param {String} connString to mongoDB
 * @returns {{model: regNewModel, userModel: registerUserModel, authUser: authUser, bootstrap: createServer}}
 */
module.exports = function (mongoose, connString) {

	if (connString) {
		mongoose.connect(connString, function (err) {
			// if we failed to connect, abort
			if (err) {
				throw err;
			} else {
				logger.log("DB connected succesfully");
			}
		});
		mongoose.connection.on('error', function(err) {
			logger.error('MongoDB error: %s', err);
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
		toCallOnCreate.push(model._exposeCallback);

		return model;
	}

	/**
	 *
	 * @param schemaExtend
	 * @param {Object} opts
	 * @param {Function} opts.authFn will be set as default authFn for any model which user script might create, MANDATORY parameter
	 * @returns {MRModel}
	 */
	function registerUserModel(schemaExtend, opts) {

		if (userModel) {    //if it was already assigned, we throw
			throw new Error('There can only be one user model');
		}
		var userSchema = require('./utils/user-model-base');
		_.extend(userSchema, schemaExtend);
		userModel = MRModel.call(mongoose, 'user', userSchema, opts);
		toCallOnCreate.push(userModel._exposeCallback);

		return userModel;
	}

	/**
	 *
	 * @param {Object} app Express.js app object
	 * @param {Manager} [iop] socket.io manager
	 * @returns {{rpcNsp: (Emitter), io: {Object}, server: http.Server}}
	 */
	function bootstrap(app, iop) {
		var io;
		if (!iop) {
			var server = app.listen(app.get('port'));

            server.on('listening', function() {
                logger.info('Express server started on port %s at %s', server.address().port, server.address().address);
            });

			io = require('socket.io').listen(server);
		} else {
			io = iop;
		}

		app.get('/moonridge-angular-client.js', function (req, res) { //exposed client file
			res.sendfile('node_modules/moonridge/built/moonridge-angular-client.js');
		});

		app.get('/moonridge-angular-client.min.js', function (req, res) { //exposed client file
			res.sendfile('node_modules/moonridge/built/moonridge-angular-client.min.js');
		});

		var allQueries = [];

		var socketNamespace = rpc.createServer(io, {expressApp: app});

		toCallOnCreate.forEach(function (CB) {
			allQueries.push(CB());   //return object containing modelName and liveQueries Object for that model
		});

		rpc.expose('Moonridge_admin', {
			getHealth: function () {
				var allModels = {};
				var index = allQueries.length;
				while(index--) {
					var modelQueriesForSerialization = {};
					var model = allQueries[index];
					for (var LQ in model.queries) {
						var listenerCount = Object.keys(model.queries[LQ].listeners).length;
						modelQueriesForSerialization[LQ] = listenerCount;
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
		});

		return {rpcNsp: socketNamespace, io: io, server: server};

	}

    var MRInstance = {
        model: regNewModel,
        userModel: registerUserModel,
        bootstrap: bootstrap
    };
    _.extend(MRInstance, auth); //adds auth methods
    return  MRInstance;
};