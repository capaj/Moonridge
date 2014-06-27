var mongoose = require('mongoose');
var _ = require('lodash');
var locals = require('./localVariables.json');
var ObjectId = mongoose.Types.ObjectId;
var Moonridge = require('../main');
var express = require('express');
var app = module.exports = express();
app.use(require('morgan')('dev'));

app.set('port', 8080);

app.use(express.static('./e2e-smoketest/'));

var server = app.listen(app.get('port'));

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

mongoose.connect(locals.connString, function (err) {
    // if we failed to connect, abort
    if (err) {
        throw err;
    } else {
        console.log("DB connected succesfully");
    }
});
mongoose.connection.on('error', function(err) {
    console.error('MongoDB error: %s', err);
});
mongoose.set('debug', true);

var MR = Moonridge.init(mongoose);
var dbInit = require('./db-init');
dbInit(MR);

var io = require('socket.io').listen(server);

io.use(function(socket, next) {
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

Moonridge.createServer(io, app);

app.get('/', function (req, res) {
    res.sendfile('./test/index.html');
});