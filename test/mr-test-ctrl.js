angular.module('MRTest', ['Moonridge', 'ngAnimate']).controller('testCtrl', function ($scope, models) {

    var fighterLQ = models.fighter.liveQuery;

    models.fighter.create({name: 'Jon Snow', health: 70});
    models.fighter.create({name: 'Roose Bolton', health: 35});
    var limit = 10;
    $scope.LQ = fighterLQ().sort('health').limit(limit).exec();
//            $scope.LQsec = liveQuery().sort('health').limit(limit).skip(1).exec();
    $scope.oneLQ = fighterLQ().findOne().exec();
    $scope.cLQ = fighterLQ().count().exec();
    $scope.LQ.promise.then(function (LQ) {
        console.log(LQ);    //LiveQuery
    });

    models.fighter.query().findOne().exec().then(function (res) {
        console.log(res);   //query result
    });

    $scope.changeQuery = function () {
        limit += 1;
        $scope.LQ = fighterLQ().sort('health').limit(limit).exec();
    };

    $scope.hit = function (fighter) {
        fighter.health -= 1;
        models.fighter.update(fighter);
    };

    $scope.heal = function (fighter) {
        fighter.health += 1;
        models.fighter.update(fighter);
    };

    $scope.remove = models.fighter.remove;

    $scope.create = function () {
        models.fighter.create({name: $scope.name, health: $scope.health});
    };

}).controller('loginCtrl',function ($scope, $MR, $q, $timeout, $rpc) {
    var dfd = $q.defer();
    var MRB = $MR('local', dfd.promise, true);  //true indicates, that this backend should be used by default
    MRB.connectPromise.then(function (socket) {
        //you can hook up more events here
        socket.on('disconnect', function () {
            console.log("Ha disconnected!");
        });
    });

    $scope.admin = function () {
        dfd.resolve({url: 'http://localhost:8080', hs: { query: "nick=admin" } } );

    };

    $scope.user = function () {
        dfd.resolve({url: 'http://localhost:8080', hs: { query: "nick=testUser" } } );

    };

});
