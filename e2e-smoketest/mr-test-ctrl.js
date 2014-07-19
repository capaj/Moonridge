angular.module('MRTest', ['Moonridge', 'ngAnimate']).controller('testCtrl', function ($scope, models) {

	var fighter = models.fighter;
	var fighterLQ = fighter.liveQuery;

    fighter.create({name: 'Jon Snow', health: 70});
    fighter.create({name: 'Littlefinger', health: 20});
    fighter.create({name: 'Roose Bolton', health: 35});
    fighter.create({name: 'Arya Stark', health: 50});

	angular.extend($scope, {
		limit: 6,
		oneLQ: fighterLQ().findOne().exec(),
		cLQ: fighterLQ().count().exec()
	});
//    $scope.LQ = fighterLQ().sort('health').limit(limit).skip(1).exec();
    $scope.LQ = fighterLQ().sort('health').limit($scope.limit).exec();

    $scope.LQ.promise.then(function (LQ) {
        console.log(LQ);    //LiveQuery
    });

    fighter.listPaths().then(function (paths) {
        console.log(paths);
    });

    $scope.LQ.on('create', function (LQ) {
        console.log('create event handler called');    //
    });

    $scope.LQ.on('remove', function (LQ) {
        console.log('remove event handler called');    //
    });

//    models.fighter.query().findOne().exec().then(function (res) {
//        console.log(res);   //query result
//    });

    $scope.changeQuery = function () {
        $scope.limit += 1;
        $scope.LQ = fighterLQ().sort('health').limit($scope.limit).exec();
    };

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
        models.fighter.create({name: $scope.name, health: $scope.health});
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

}).controller('loginCtrl', function ($scope, $MR, $q) {
    var dfd = $q.defer();

    //Moonridge backend
	var MRB = $MR('local', dfd.promise, true);  //true indicates, that this backend should be used by default
    MRB.connectPromise.then(function (socket) {
        //you can hook up more events here
        socket.on('disconnect', function () {
            console.log("Ha disconnected!");
        });
    });
    var url = 'http://localhost:8080';

    $scope.admin = function () {
        dfd.resolve({url: url, hs: { query: "nick=admin" } } );

    };

    $scope.user = function () {
        dfd.resolve({url: url, hs: { query: "nick=testUser" } } );

    };

});
