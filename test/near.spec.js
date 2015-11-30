require('chai').should()
var mrPair = require('./utils/run_server_client')
var mr = mrPair.client
var locationsDbCreation = require('./utils/create_locations_and_delete_after')

describe.skip('near queries', function() {
	this.timeout(7000)
	var locModel

	before(function() {
		locModel = mr.model('location')
		return locationsDbCreation.before(locModel)
	})

	after(function() {
		return locationsDbCreation.after()
	})

})
