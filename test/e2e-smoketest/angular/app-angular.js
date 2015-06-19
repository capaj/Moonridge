require('jquery');
require('angular');
require('./js/bootstrap.min');
require('angular-animate');
var $MR = require('moonridge-client');
var MRB = $MR({url: 'http://localhost:8080'});  //true indicates, that this backend should be used by default
MRB.socket.on('disconnect', function() {
	console.log("Ha disconnected!");
});


angular.module('MRTest', ['ngAnimate']).controller('fighterCtrl', function ($scope, $log) {
	MRB.rpc.events.batchEnds = function() {
		console.log('applies');
		$scope.$apply();
	};
	var fighter = MRB.model('fighter');
	var user = MRB.model('user');
	var fighterLQ = fighter.liveQuery;

	angular.extend($scope, {
		limit: 6,
		oneLQ: fighterLQ().findOne().exec(),
		cLQ: fighterLQ().count().exec()
	});

    var runQuery = function () {
        $scope.LQ = fighterLQ().sort('health').limit($scope.limit).exec();
    };

    $scope.$watch('limit', function(newValue, oldValue) {
        if (angular.isNumber(newValue)) {
            runQuery();
        }
    });

    runQuery();

    $scope.LQ.promise.then(function (LQ) {
        console.log(LQ);    //LiveQuery
    });

    fighter.listPaths().then(function (paths) {
        console.log(paths);
    });

    $scope.oneLQ.on('add', function (LQ) {
        console.log('add event handler called');    //
    });

    $scope.oneLQ.on('remove', function (LQ) {
        console.log('remove event handler called');    //
    });

    $scope.oneLQ.on('any', function (LQ) {
        console.log('oneLQ.docs', $scope.oneLQ.docs);    //
    });

    $scope.admin = user.query().findOne().exec();


    $scope.hit = function (afighter) {
        afighter.health -= 1;
        fighter.update(afighter);
    };

    $scope.heal = function (afighter) {
        afighter.health += 1;
        fighter.update(afighter);
    };

    $scope.remove = fighter.remove;

    $scope.create = function () {
        fighter.create({name: $scope.name, health: $scope.health});
    };

    $scope.dropdownTexts = [
        "fighter's name",
        "fighter's health",
        false,
        "fighter's death",
        "fighter's owner",
        "fighter's _id",
        'version'
    ];

    console.log("user", MRB.user);

    $scope.admin = function() {
        MRB.authorize({nick: 'admin'}).then(function(user){ //user === moonridgeBackend.user
            console.log("user", user);
            fighter.create({name: 'Jon Snow', health: 70});
            fighter.create({name: 'Littlefinger', health: 20});
            fighter.create({name: 'Roose Bolton', health: 35});
            fighter.create({name: 'Arya Stark', health: 50});
        });
    };

    $scope.user = function() {
        MRB.authorize({nick: 'testUser'});
    };

});
