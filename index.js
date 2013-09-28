var rpc = require('socket.io-rpc');

module.exports = function (server, app) {
    var io = require('socket.io').listen(server);
    io.set('log level', 1);
    io.set('transports', [ 'websocket']);
//    io.set('heartbeats', false);  // we would like this, but it does not work like this
    rpc.createServer(io, app);

};
