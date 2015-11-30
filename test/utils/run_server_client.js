var cp = require('child_process')

var server = cp.fork('./test/e2e-smoketest/server.js')

var $MR = require('../../Moonridge-client/moonridge-client')

//Moonridge backend
var mr = $MR({url: 'http://localhost:8080', hs: {query: 'nick=testUser'}})

mr.socket.on('disconnect', function() {
	throw new Error('Disconnection should not occur')
})

module.exports = {
	server: server,
	client: mr
}

after(function() {
	console.log("killing the server")
	server.kill()
})
