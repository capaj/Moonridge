var $MR = require('moonridge-client')

var MRB = $MR({url: 'http://localhost:8080'})
console.log(MRB)

var LQ = MRB.model('fighter').liveQuery().find().exec()
LQ.on('any', function (ev, params) {
  console.log('LQ', this)
  console.log('params', ev, params)
})
