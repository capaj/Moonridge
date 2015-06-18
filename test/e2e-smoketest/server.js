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

app.use(staticMW('./Moonridge-client/'));//only needed when moonridge is not as npm module

app.use(staticMW('./test/e2e-smoketest/'));
app.use(staticMW('./test/e2e-smoketest/angular'));
app.use(staticMW('./test/e2e-smoketest/aurelia'));
app.use(staticMW('./test/e2e-smoketest/react'));

server.io.use(function(socket, next) {	//example of initial authorization
	//it is useful only for apps which require user authentication by default
	var authObj = socket.handshake.query;
	var userName = authObj.nick;

	console.log("user wants to authorize: " + userName );
	console.log("socket: ", socket.handshake.query);
	console.log("socket.id: " + socket.id);
	var user = mongoose.model('user');
	user.findOne({name: userName}).exec().then(function (user) {
		if (user) {
			console.log("Authenticated user: ", user);
			socket.moonridge.user = user;
		}
		next();
	}, function (err) {
		console.log("auth error " + err);
		next(err);
	});

});

server.expose({
	MR: {
		authorize: function(userName) {	//example of a later authorization, typical for any public facing apps
			var socket = this;
			var user = mongoose.model('user');
			return user.findOne({name: userName}).exec().then(function (user) {
				console.log("Authenticated user: ", user);
				socket.moonridge.user = user;
				return user;
			}, function (err) {
				console.log("auth error " + err);
			});
		}
	}
});