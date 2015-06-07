Moonridge    [![Build Status](https://travis-ci.org/capaj/Moonridge.svg?tag=1.0.3)](https://travis-ci.org/capaj/Moonridge) [![Dependency Status](https://david-dm.org/capaj/Moonridge.svg)](https://david-dm.org/capaj/Moonridge)
=========
[![NPM badge](https://nodei.co/npm/moonridge.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/moonridge/)



isomorphic [client side library](https://github.com/capaj/Moonridge-client) and server framework, which brings Mongoose model to the browser(or over the network to other node process). Based on [socket.io-rpc](https://github.com/capaj/socket.io-rpc). Framework agnostic-usable with any framework-let it be Angular, Aurelia, React or any other.


Offers killer feature(live queries) from Meteor.js. How?
See examples in smoke test folder([Angular](test/e2e-smoketest/angular)|[Aurelia](test/e2e-smoketest/aurelia)), if still not sufficent, read source code. Better docs are planned/WIP.

##Basic usage serverside
```javascript
    var mongoose = require('mongoose');
    var Moonridge = require('moonridge');
    var MR = moonridge(mongoose, "mongodb://localhost/moonridge_showcase");		//MongoDB address is optional-you can connect as always with mongoose

    var bookModel = MR.model('book', {  //mongoose schema defintion
            name: String,
            author: String
        }, {
             schemaInit: function (schema) {
                // makes sure only one book per nameXauthor exists
                schema.index({ name: 1, author: 1 }, { unique: true, dropDups: true });
            }
        });
    ...
    MR.bootstrap(app);	//app is your express app, Moonridge will start listening on port app.get("port")
```
##On the CLIENT:
```javascript
   	var $MR = require('moonridge-client');
	//Moonridge backend
	var mr = $MR({url: 'http://localhost:8080', hs: {query: 'nick=testUser'}});
	var fighterModel = mr.model('fighter');
	//live query
	var LQ = fighterModel.liveQuery().sort('health').exec();	
	//create a new entity
	fighterModel.create({name: 'Arya', health: 50}).then(function(created){
		console.log('created a fighter: ', created);
		//LQ.docs now also contains Arya
	});
```    
Also you need to connect to your backend-Moonridge uses a promise resolution for this. See [how in the included smoketest](https://github.com/capaj/Moonridge/blob/8faf7ad4b7c6c0301d70c3d8a346348d2b21e86d/e2e-smoketest/mr-test-ctrl.js#L84)

##Errorhandling

All server-client communication is done with [socket.io-rpc](https://github.com/capaj/socket.io-rpc) -another project of mine, so errors are propagated for all server-side calls which return an error(or reject their promise). This is especially helpful with schema validation errors.

##Supported browsers
###Desktop
    Internet Explorer 8+ - though it needs es5shim
    Safari 4+
    Google Chrome 4+
    Firefox 4+
    Opera 10.61+
###Mobile
    iPhone Safari
    iPad Safari
    Android WebKit
    WebOs WebKit

### Why not just mongoosejs on the client side?
One could ask why not just port mongoosejs to the client side and let clients talk to mongo directly. While this would surely be an interesting project, Moonridge has features which would not be possible without a server instance(live querying, custom authorization/authentication). I think these features are worth it introducing a new framework to the backend.
    
## How does live querying work in one paragraph
Every client liveQuery is serialized and sent via socket.io to backend. Backend parses it and constructs real mongoose query, wich is immediately run(if it doesn't exist already in server memory). The return is sent back to client. Any change to a certain document (creation, deletion, update) is checked again for all in-memory queries. MongoDB checks just one recently changed document, not the whole query, so it should be pretty quick. If query is satisfied, the changed document is propagated to listening clients. And that is basically it.

Pull requests are welcome and same goes for issues!

