var rpc = require('socket.io-rpc');
var mongoose = require('mongoose');
var model = require('./mr-model');
var lastChangeDate = new Date();

module.exports = function (server, app) {
    var io = require('socket.io').listen(server);
    io.set('log level', 1);
    io.set('transports', [ 'websocket']);
//    io.set('heartbeats', false);  // we would like this, but it does not work like this
    rpc.createServer(io, app);

    rpc.expose('Moonridge', {
        getModels: function (cachedDate) {
            if (lastChangeDate > cachedDate) {     // if server was restarted since the cached copy was stored
                var models = mongoose.models;
                return models;
            } else {
                return false;
            }
        }
    });

    function regNewModel() {
        lastChangeDate = new Date();
        return model.apply(this, arguments);
    }

    return {io: io, model: regNewModel};
};
