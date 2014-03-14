var rpc = require('socket.io-rpc');
var _ = require('lodash');
var MRModel = require('./mr-model');
var userModel;
var toCallOnCreate = [];
var logger = require('./logger/logger');

var init = function (mongoose) {

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
	 * @returns {*}
	 */
	function registerUserModel(schemaExtend, opts) {

		if (userModel) {    //if it was already assigned, we throw
			throw new Error('There can only be one user model');
		}
		var userSchema = require('./user-model-base');
		_.extend(userSchema, schemaExtend);
		userModel = MRModel.call(mongoose, 'user', userSchema, opts);
        toCallOnCreate.push(userModel._exposeCallback);

        return userModel;
	}

    /**
     *
     * @param hn
     * @param {Object} user must have _id nad other mongoDB properties
     */
    function authUser(hn, user) {
//        logger.info("Authenticated socket with id: " + hn.id);
        hn.user = user;
    }

    return {model: regNewModel, userModel: registerUserModel, authUser: authUser};
};

/**
 * @param {Manager} io socket.io manager
 * @param app

 * @returns {SocketNamespace} master socket namespace
 */
var createServer = function (io, app) {

    app.get('/moonridge-angular-client.js', function (req, res) { //exposed client file
        res.sendfile('node_modules/moonridge/client/moonridge-angular-client.js');
    });

    app.get('/moonridge-angular-client-rpcbundle.js', function (req, res) { //exposed client file
        res.sendfile('node_modules/moonridge/built/moonridge-angular-client-rpcbundle.js');
    });

    app.get('/moonridge-angular-client-rpcbundle.min.js', function (req, res) { //exposed client file
        res.sendfile('node_modules/moonridge/built/moonridge-angular-client-rpcbundle.min.js');
    });
    var allQueries = [];

    app.get('/health', function(req, res){

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
        res.send({
            pid: process.pid,
            memory: process.memoryUsage(),
            uptime: process.uptime(),   //in seconds
            liveQueries: allModels  //key is LQ.clientQuery and value is number of listening clients
        });
    });

    var socketNamespace = rpc.createServer(io, {expressApp: app});

    toCallOnCreate.forEach(function (CB) {
       allQueries.push(CB());   //return object containing modelName and liveQueries Object for that model
    });

    return socketNamespace;

//    rpc.expose('Moonridge', {
//        getModels: function () {
//			return mongoose.models;
//        }
//    });

};

module.exports = {init: init, createServer: createServer};