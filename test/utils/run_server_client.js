/* eslint-env node, mocha */
'use strict'
const cp = require('child_process')
process.on('unhandledRejection', function (error, promise) {
  console.error('UNHANDLED REJECTION', error.stack, error.message)
})
const server = cp.fork('./test/e2e-smoketest/server.js')

const $MR = require('../../Moonridge-client/moonridge-client')

// Moonridge backend
const mr = $MR({url: 'http://localhost:8080', hs: {query: 'nick=testUser'}})
const mongojs = require('mongojs')

let models = ['fighters', 'battles', 'users', 'locations', 'sample_models']
const db = mongojs('mrtest', models)
let allDone = false

mr.socket.on('disconnect', function () {
  if (!allDone) {
    throw new Error('Disconnection should not occur')
  }
})

module.exports = {
  server: server,
  client: mr
}

after(function (done) {
  allDone = true
  models.forEach((collName, i) => {
    db[collName].drop(() => {
      if (i === 4) {
        server.on('close', done)
        console.log('killing the test server')
        return server.kill()
      }
    })
  })
})
