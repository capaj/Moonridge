var mongoose = require('mongoose');
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
var MR = MRinit(mongoose, server, app);


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

//    Fighter.model.create({
//        name: 'Bran'
//        , health: 150
//        , born: new Date()
//    }).then(function () {
//            console.log("created");
//        });
//
//        var c = 7;
//        setInterval(function () {
//            Fighter.model.create({
//                name: 'goldCloak' + c
//                , health: 30
//                , born: new Date()
//            }).then(function (doc) {
//                    console.log(doc.name + " saved");
//                });
//            c++;
//        }, 2000);


});
