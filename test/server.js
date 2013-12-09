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

var user = MR.userModel({name: String, age: Number});

//just run once to have a user
//user.model.create({
//	name: 'capaj', privilige_level: 50
//}).then(function () {
//		console.log("capaj created");
//	});


var Fighter = MR.model('fighter', {
	name: String,
	health: Number,
	born: Date,
	death: { type: Date, permissions:{R: 4, W: 20}},
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true }
});
Fighter.model.on('preupdate', function (doc, evName, previous) {
   console.log("special preupdate callback triggered " + doc.isModified()); // a good place to put custom save logic
   console.dir(doc);
   console.dir(previous);
});

Fighter.model.find().sort('health').maxScan(2).find().exec().then(function (doc) {
    console.dir(doc);
});

//    var battleM = MR('battle', {
//        name: String,
//        started: Date,
//        ended: Date,
//        fighters: [{ type: Schema.Types.ObjectId, ref: 'Fighter' }]
//    });

//Fighter.model.create({
//	name: 'Rob Stark', health: 150, born: new Date()
//}).then(function () {
//
//		console.log("created");
//
//		Fighter.model.find({}, function (err, docs) {
//			if (docs) {
//				setTimeout(function () {
//
//					var doc = docs[0];
//					if (doc) {
//						doc.remove(function (err) {
//							if (err) {
//
//							}
//							console.log("deleted");
//						});
//					}
//
//				}, 8000);
//			}
//		});
//	}
//);
//    var c = 0;
//
//    setInterval(function () {
//        Fighter.model.create({
//            name: 'gold cloak ' + c
//            , health: 30
//            , born: new Date()
//        }).then(function (doc) {
//                console.log(doc.name + " saved");
//            });
//        c++;
//    }, 3000);    var c = 0;
//
//    setInterval(function () {
//        Fighter.model.create({
//            name: 'gold cloak ' + c
//            , health: 30
//            , born: new Date()
//        }).then(function (doc) {
//                console.log(doc.name + " saved");
//            });
//        c++;
//    }, 3000);
var io = require('socket.io').listen(server);
io.configure(function (){
    io.set('authorization', function (handshake, CB) {
        var socket = this;
        var userName = handshake.query.nick;
        console.log("user wants to authorize: " + userName );
        user.model.findOne({name: userName}).exec().then(function (user) {
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

app.get('*', function (req, res) {
    res.sendfile('./test/index.html');
});