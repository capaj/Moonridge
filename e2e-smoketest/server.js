var mongoose = require('mongoose');
var _ = require('lodash');
var locals = require('./localVariables.json');

var Moonridge = require('../main');
var express = require('express');
var app = module.exports = express();
app.use(require('morgan')('dev'));

app.set('port', 8080);

app.use(express.static('./e2e-smoketest/'));

//FOLLOWING is not needed in typical app-it is needed here since we don't have moonridge as npm module
//only needed for IE8, don't include if you don't want to support IE8
app.get('/es5-shim.js', function (req, res) {
    res.sendfile('./node_modules/socket.io-rpc/tests/es5-shim.js');
});
app.get('/moonridge-client.css', function (req, res) {
    res.sendfile('./built/moonridge-client.css');
});
//This block is not needed when running normally as npm module
app.get('/moonridge-angular-client.js', function (req, res) { //expose client file, because since this test does not have moonridge as npm module
	res.sendfile('./client/moonridge-angular-client.js');
});
app.get('/moonridge-methods-client-validations.js', function (req, res) { //expose client file, because since this test does not have moonridge as npm module
	res.sendfile('./client/moonridge-methods-client-validations.js');
});
app.get('/moonridge-angular-client-rpcbundle.js', function (req, res) { //expose client file, because since this test does not have moonridge as npm module
    res.sendfile('./built/moonridge-angular-client-rpcbundle.js');
});

app.get('/moonridge-angular-client-rpcbundle.min.js', function (req, res) { //exposed client file
    res.sendfile('./built/moonridge-angular-client-rpcbundle.min.js');
});
//END of special block which is only needed when moonridge is not as npm module

mongoose.set('debug', true);

var MR = Moonridge(mongoose, locals.connString);
var dbInit = require('./db-init');
dbInit(MR);

var bootstrapped = MR.bootstrap(app);

bootstrapped.io.use(function(socket, next) {
	var userName = socket.request._query.nick;

	console.log("user wants to authorize: " + userName );
	console.log("socket.id: " + socket.id);
	var user = mongoose.model('user');
	user.findOne({name: userName}).exec().then(function (user) {
		MR.authUser(socket, user);
		console.log("Authenticated user: " + user.name);
		next();
	}, function (err) {
		console.log("auth error " + err);
		next(new Error('not authorized'));
	})
});

app.get('/', function (req, res) {
    res.sendfile('./test/index.html');
});