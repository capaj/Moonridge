var $MR = require('../client/moonridge-node');
var Promise = require('bluebird');

var dfd = Promise.defer();

//Moonridge backend
var MRB = $MR('local', dfd.promise, true);  //true indicates, that this backend should be used by default
MRB.connectPromise.then(function(socket) {
  //you can hook up more events here
  socket.on('disconnect', function() {
    console.log("Ha disconnected!");
  });
});

dfd.resolve({url: 'http://localhost:8080'});

MRB.getModel('fighter').then(function(fighter) {
  var LQ = fighter.liveQuery().sort('health').exec();
  LQ.on('any', function(params) {
    console.log("LQ", this);
    console.log("params", params);
  })
});