var mongoose = require('mongoose');

module.exports = function (MR) {

	var user = MR.userModel({name: String, age: Number});
	var location = MR.model('location', {loc: {type:[Number], index: '2dsphere'}}, {
		schemaInit: function(schema) {

		}
	});	//for testing near queries
	var fighter = MR.model('fighter', {
		name: String,
		health: Number,
		born: Date,
		death: {type: Date, permissions: {R: 4, W: 20}}
	}, {
		schemaInit: function(schema) {
			// if you want to call any methods on schema before model is created, you can do so in schemaInit
			schema.index({owner: 1, name: 1}, {unique: true, dropDups: true});
			// you may notice that we index here field owner even though we did not specify such field in the schema. It is because owner field is added to every model schema
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
	});


	fighter.schema.on('preupdate', function (doc, previousDocVersion) {
		console.log("fighter preupdate callback triggered, is modified ", doc.isModified()); // a good place to put custom save logic
		console.log('doc', doc);
		console.log('previousDocVersion', previousDocVersion);
	});

	var battleM = MR.model('battle', {
		name: String,
		year: {type: Number},
		fighters: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Fighter' }]
	});

	battleM.schema.on('update', function (doc, previousDocVersion) {
		console.log("battle update callback triggered, is modified ", doc.isModified()); // a good place to put custom save logic
		console.log(doc);
		console.log(previousDocVersion);
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