var mongoose = require('mongoose');
var Promise = require('bluebird');

module.exports = function (MR) {
    var prs = [];

	var user = MR.userModel({name: String, age: Number});
	var fighter = MR.model('fighter', {
			name: String,
			health: Number,
			born: Date,
			death: { type: Date, permissions: {R: 4, W: 20}},
			owner: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true }
		}, {
			schemaInit: function (schema) {
				// if you want to call any methods on schema before model is created, you can do so in schemaInit
				schema.index({ owner: 1, name: 1 }, { unique: true, dropDups: true });
			},
			permissions: {
				C: 20,
				R: 0,
				U: 50,
				D: 50
			}
//            checkPermission: function () {    //for overriding permission check
//                return false;
//            }
		}
	);


	fighter.model.on('preupdate', function (doc, evName, previous) {
		console.log("special preupdate callback triggered " + doc.isModified()); // a good place to put custom save logic
		console.dir(doc);
		console.dir(previous);
	});

	var battleM = MR.model('battle', {
		name: String,
		year: Number,
		fighters: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Fighter' }]
	});

    var cleaningPromises = [fighter, user].map(function (mrModel) {
        var dfd = Promise.defer();

        mrModel.model.remove({}, function(err) {
            if (err) {
                dfd.reject();
            }
            dfd.resolve();
        });
        return dfd.promise;

    });

    Promise.all(cleaningPromises).then(function () {
        console.log("all collections should be clean");

        user.model.create({
            name: 'admin', privilige_level: 50
        }).then(function () {
            console.log("admin created");
        });

        user.model.create({
            name: 'testUser', privilige_level: 10
        }).then(function () {
            console.log("testUser created");
        });

    });

};