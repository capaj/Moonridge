'use strict'
var cp = require('child_process')

var server = cp.fork('./test/e2e-smoketest/server.js')

var $MR = require('../../Moonridge-client/moonridge-client')

//Moonridge backend
var mr = $MR({url: 'http://localhost:8080', hs: {query: 'nick=testUser'}})
const mongojs = require('mongojs')

let models = ['fighters', 'battles', 'users', 'locations', 'sample_models'];
const db = mongojs('mrtest', models)
let allDone = false

mr.socket.on('disconnect', function() {
	if (!allDone) {
		throw new Error('Disconnection should not occur')
	}
})

module.exports = {
	server: server,
	client: mr
}

after(function(done) {
	allDone = true
	models.forEach((collName, i) => {
		db[collName].drop(() => {
			if (i === 4) {
				server.on('close', done)
				console.log("killing the test server")
				return server.kill()
			}
		})
	})

})
