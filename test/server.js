var mongoose = require('mongoose');
var when = require('when');
var locals = require('./localVariables.json');
var Schema = mongoose.Schema;
var ObjectId = mongoose.Types.ObjectId;
var MR = require('../index');
var app = module.exports = express();


mongoose.connect(locals.connString, function (err) {
    // if we failed to connect, abort
    if (err) {
        throw err;
    } else {
        console.log("DB connected succesfully");
    }

});

var server = app.listen(app.get('port'), function () {
    console.info("Express server listening on port %d in %s mode", this.address().port, app.settings.env);
    var MRi = MR(server, app);
    var MRModel = MRi.model;
    var io = MRi.io;


    var Fighter = MRModel('Fighter', {
        name: String,
        health: Number,
        born: Date,
        death: Date
    });

    var battleM = MRModel('battle', {
        name: String,
        started: Date,
        ended: Date,
        fighters: [{ type: Schema.Types.ObjectId, ref: 'Fighter' }]
    });

    var bran = new Fighter({
        name: 'Bran'
        , health: 150
        , born: new Date()
    }).save(function (err) {
        console.log("bran saved");
    });
});

