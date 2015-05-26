var mongoose = require('mongoose');
var _ = require('lodash');
var locals = require('./localVariables.json');

var Moonridge = require('../../main');
var staticMW = require('express').static;

mongoose.set('debug', true);

var MR = Moonridge(mongoose, locals.connString);
var dbInit = require('./db-init');
dbInit(MR);

var server = MR.bootstrap(8080);
var app = server.expressApp;
app.use(require('morgan')('dev'));

app.use(staticMW('./client/'));//only needed when moonridge is not as npm module

app.use(staticMW('./test/e2e-smoketest/'));
app.use(staticMW('./test/e2e-smoketest/angular'));
app.use(staticMW('./test/e2e-smoketest/aurelia'));

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
