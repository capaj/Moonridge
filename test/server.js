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
    res.sendfile('./client/moonridge-angular-client-rpcbundle.js');
});

app.get('*', function (req, res) {
    res.sendfile('./test/index.html');
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
user.model.create({
	name: 'capaj'
}).then(function (obj) {
		console.log("capaj created");
	});


var Fighter = MR.model('fighter', {
	name: String,
	health: Number,
	born: Date,
	death: { type: Date, permissions:{R: 4, W: 20}}
});

//    var battleM = MR('battle', {
//        name: String,
//        started: Date,
//        ended: Date,
//        fighters: [{ type: Schema.Types.ObjectId, ref: 'Fighter' }]
//    });

Fighter.model.create({
	name: 'Rob Stark', health: 150, born: new Date()
}).then(function () {

		console.log("created");

		Fighter.model.find({}, function (err, docs) {
			if (docs) {
				setTimeout(function () {

					var doc = docs[0];
					if (doc) {
						doc.remove(function (err) {
							if (err) {

							}
							console.log("deleted");
						});
					}

				}, 8000);
			}
		});
	}
);
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

Moonridge.createServer(server, app, {
    authFn: function (handshake, CB) {
    var socket = this;
    user.model.find({name:handshake}).then(function (user) {
        socket.user = user;
        CB(true);
    }, function (err) {
        console.log("auth error " + err);
        CB(false);
    })
}
});