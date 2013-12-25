var mongoose = require('mongoose');
var collectionsForDrop = ['fighters', 'users'];
var Promise = require('bluebird');

module.exports = function (MR) {
    var prs = [];
    var user = MR.userModel({name: String, age: Number});

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

    var battleM = MR.model('battle', {
        name: String,
        started: Date,
        ended: Date,
        fighters: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Fighter' }]
    });

    collectionsForDrop.forEach(function (coll) {
        var dfd = Promise.defer();
        prs.push(dfd.promise);
        mongoose.connection.collections[coll].drop( function(err) {
            console.log('collection ' + coll + ' dropped');
            dfd.resolve();
        });
    });

    Promise.all(prs).then(function () {
        console.log("all collections should be dropped");

        //just run once to have a user
        user.model.create({
            name: 'admin', privilige_level: 50
        }).then(function () {
            console.log("admin created");
        });


    });


};