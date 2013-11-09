var mongoose = require('mongoose');
var locals = require('./localVariables.json');
var Schema = mongoose.Schema;
var ObjectId = mongoose.Types.ObjectId;
var MRinit = require('../index');
var express = require('express');
var app = module.exports = express();


mongoose.connect(locals.connString, function (err) {
    // if we failed to connect, abort
    if (err) {
        throw err;
    } else {
        console.log("DB connected succesfully");
    }

    var server = app.listen(app.get('port'), function () {
        console.info("Express server listening on port %d in %s mode", this.address().port, app.settings.env);
        var MR = MRinit(mongoose, server, app);

        var Schema = mongoose.Schema;

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


});
