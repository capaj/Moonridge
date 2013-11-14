var mongoose = require('mongoose');
var _ = require('lodash');
var locals = require('./localVariables.json');
var Schema = mongoose.Schema;
var ObjectId = mongoose.Types.ObjectId;
var MRinit = require('../main');
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

var MR = MRinit(mongoose, server, app).model;


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


    var Fighter = MR('fighter', {
        name: String,
        health: Number,
        born: Date,
        death: Date
    });

    var battleM = MR('battle', {
        name: String,
        started: Date,
        ended: Date,
        fighters: [{ type: Schema.Types.ObjectId, ref: 'Fighter' }]
    });

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
//    }, 3000);



});
