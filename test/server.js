var mongoose = require('mongoose');
var _ = require('lodash');
var locals = require('./localVariables.json');
var ObjectId = mongoose.Types.ObjectId;
var Moonridge = require('../main');
var express = require('express');
var app = module.exports = express();

app.configure(function(){
    app.set('port', 8080);
    app.use(express.favicon());
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(express.static('./test/'));
    app.use(app.router);

});

var server = app.listen(app.get('port'));

//This block is not needed when running normally as npm module
app.get('/es5-shim.js', function (req, res) {
    res.sendfile('./node_modules/socket.io-rpc/tests/es5-shim.js');
});
app.get('/moonridge-angular-client.js', function (req, res) { //expose client file, because since this test does not have moonridge as npm module
	res.sendfile('./client/moonridge-angular-client.js');
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

var MR = Moonridge.init(mongoose);
var dbInit = require('./db-init');
dbInit(MR);

var io = require('socket.io').listen(server);
io.configure(function (){
    io.set('authorization', function (handshake, CB) {
        var socket = this;
        var userName = handshake.query.nick;
        console.log("user wants to authorize: " + userName );
        var user = mongoose.model('user');
        user.findOne({name: userName}).exec().then(function (user) {
            socket.user = user;
            console.log("Authenticated user: " + user.name);
            CB(null, true);
        }, function (err) {
            console.log("auth error " + err);
            CB(null, false);
        })
    });
});

Moonridge.createServer(io, app);

app.get('/', function (req, res) {
    res.sendfile('./test/index.html');
});