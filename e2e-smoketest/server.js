var mongoose = require('mongoose');
var _ = require('lodash');
var locals = require('./localVariables.json');

var Moonridge = require('../main');
var express = require('express');
var app = module.exports = express();
app.use(require('morgan')('dev'));

app.set('port', 8080);

app.use(express.static('./client/'));//only needed when moonridge is not as npm module

app.use(express.static('./e2e-smoketest/'));


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