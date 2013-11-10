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
app.get('/mr-angular-client.js', function (req, res) {
    res.sendfile('./client/mr-angular-client.js');
});
var server = app.listen(app.get('port'));

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

    Fighter.create({
        name: 'Bran'
        , health: 150
        , born: new Date()
    }).then(function () {
            console.log("created");
        });
//
//        var c = 7;
//        setInterval(function () {
//            console.log("ppp");
//            var gof = new Fighter({
//                name: 'goldCloak' + c
//                , health: 30
//                , born: new Date()
//            }).save(function (err) {
//                    console.log("gold cloak" + c + " saved");
//                });
//            c++;
//        }, 2000);


});
