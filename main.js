var rpc = require('socket.io-rpc');
var _ = require('lodash');
var MRModel = require('./mr-model');

var defIOSetter = function (io, authFn) {
	io.set('log level', 1);
	io.set('transports', [ 'websocket']);
	//    io.set('heartbeats', false);  // we would like this, but it does not work like this

    if (authFn) {
        io.set('authorization', authFn);
    }
};

var authFn;

var init = function (mongoose) {

	/**
	 *
	 * @returns {MRModel}
	 */
    function regNewModel(name, schema, opts) {
		if (authFn) {
			if (!opts) {
				opts = {};
			}
			if (opts.authFn) {
				//TODO think about this
                throw new Error('When global auth method is defined, individual model auth methods must not be defined.');
			}
			opts.authFn = authFn;
		}

        return MRModel.apply(mongoose, arguments);
    }


	/**
	 *
	 * @param schemaExtend
	 * @param {Object} opts
	 * @param {Function} opts.authFn will be set as default authFn for any model which user script might create, MANDATORY parameter
	 * @returns {*}
	 */
	function registerUserModel(schemaExtend, opts) {
		if (authFn) {
			throw new Error('There can only be one user model');
		}
		var userSchema = require('./user-model-base');
		_.extend(userSchema, schemaExtend);
		authFn = opts.authFn;
		return MRModel.call(mongoose, 'user', schemaExtend, opts)
	}

	return {model: regNewModel, userModel: registerUserModel};
};

/**
 * @param server
 * @param app
 * @param {Object} opts
 * @param {Object} opts.auth
 * 		example: {global: function(handshake, CB){CB()}, methods: {method: }}
 * @param {Function} opts.ioSetter function for setting up socket io
 * @returns {SocketNamespace} master socket namespace
 */
var createServer = function (server, app, opts) {
    var io = require('socket.io').listen(server);

    app.get('/moonridge-angular-client.js', function (req, res) { //exposed client file
        res.sendfile('/node_modules/moonridge/client/moonridge-angular-client.js');
    });

    app.get('/moonridge-angular-client-rpcbundle.js', function (req, res) { //exposed client file
        res.sendfile('/node_modules/moonridge/client/moonridge-angular-client-rpcbundle.js');
    });

    io.configure(function (){
        if (_.isFunction(opts && opts.ioSetter)) {
            opts.ioSetter(io)
        } else {
            defIOSetter(io, opts.authFn);
        }
    });


    return rpc.createServer(io, app);

//    rpc.expose('Moonridge', {
//        getModels: function () {
//			return mongoose.models;
//        }
//    });

};

module.exports = {init: init, createServer: createServer};