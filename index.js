var rpc = require('socket.io-rpc');

rpc.expose('Moonridge', {
    getModels: function (cachedDate) {
        if (runDate > cachedDate) {     // if server was restarted since the cached copy was stored
            var models = mongoose.models;
            return models;
        } else {
            return false;
        }
    }
});

module.exports = function (server, app) {
    var io = require('socket.io').listen(server);
    io.set('log level', 1);
    io.set('transports', [ 'websocket']);
//    io.set('heartbeats', false);  // we would like this, but it does not work like this
    rpc.createServer(io, app);
};
