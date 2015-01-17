var mongoose = require('mongoose');
var _ = require('lodash');
var locals = require('./localVariables.json');

var Moonridge = require('../../main');
var express = require('express');
var app = module.exports = express();
app.use(require('morgan')('dev'));

app.set('port', 8080);

app.use(express.static('./client/'));//only needed when moonridge is not as npm module

app.use(express.static('./test/e2e-smoketest/'));


mongoose.set('debug', true);

var MR = Moonridge(mongoose, locals.connString);
var dbInit = require('./db-init');
dbInit(MR);

var bootstrapped = MR.bootstrap(app);

MR.auth = function(socket, authObj) {
	var userName = authObj.nick;

	console.log("user wants to authorize: " + userName );
	console.log("socket.id: " + socket.id);
	var user = mongoose.model('user');
	return user.findOne({name: userName}).exec().then(function (user) {
		console.log("Authenticated user: " + user.name);
		return user;
	}, function (err) {
		console.log("auth error " + err);
		return new Error('not authorized');
	})
};

//use this for global authentication via socket.io
//bootstrapped.io.use(function(socket, next) {
//
//});

app.get('/', function (req, res) {
    res.sendfile('./test/e2e-smoketest/index.html');
});