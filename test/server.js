var mongoose = require('mongoose');
var when = require('when');
var locals = require('./localVariables.json');
var Schema = mongoose.Schema;
var ObjectId = mongoose.Types.ObjectId;
var MR = require('../mr-model.js');

var fighterM = MR('Fighter', {
    name: String,
    health: Number,
    born: Date,
    death: Date
});

/**
 * Game schema
 */

var battleM = MR('battle', {
    name: String,
    started: Date,
    ended: Date,
    fighters: [{ type: Schema.Types.ObjectId, ref: 'Fighter' }]
});

mongoose.connect(locals.connString, function (err) {
    // if we failed to connect, abort
    if (err) {
        throw err;
    } else {
        console.log("DB connected succesfully");
    }
});

fighterM.create({
    name: 'Bran'
    , health: 150
    , born: new Date()
}, function (err, bran) {
    console.log("after create");
});