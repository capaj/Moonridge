Moonridge    [![Build Status](https://travis-ci.org/capaj/Moonridge.svg?tag=1.0.3)](https://travis-ci.org/capaj/Moonridge) [![Dependency Status](https://david-dm.org/capaj/Moonridge.svg)](https://david-dm.org/capaj/Moonridge)
=========
[![NPM badge](https://nodei.co/npm/moonridge.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/moonridge/)



Allows to call Mongoose remotely through socket.io-rpc. Usable in browser with any framework-let it be Angular, Aurelia, React or any other.
It is also isomorphic, so your client can be another node.js process(nice for midway testing).
Offers killer feature(live queries) from Meteor.js for your frontend in a framework agnostic fashion. How?
See examples([Angular](test/e2e-smoketest/angular)|[Aurelia]((test/e2e-smoketest/aurelia))), if still not sufficent, read source code. Better docs are planned/WIP.

#Prerequisities

Moonridge is written in commonJS format(client works in node and browser without much hassle), so you need globally installed [jspm](https://github.com/jspm/jspm-cli) to be able to install it and run it.
If you don't have jspm, install it with this command:

    npm i jspm -g

Also currently it requires to have socket.io-rpc installed too. This I will get rid of.

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
##On the CLIENT side with AngularJS:
###HTML
```html
	<!--You need to use mr-controller instead of ng-controller-->
    <div mr-controller="bookCtrl" mr-models="book"><!--You can load any number of models you like, separate them by commas-->
        <div ng-repeat="book in LQ.docs">
            <!-- regular angular templating -->
        </div>
    </div>
    <!--include client side script after angular-->
    <script type="text/javascript" src="/moonridge-angular-client.js"></script>
```    
###JS
```javascript
    //define Moonridge angular module as dependency
	angular.module('app', ['Moonridge']).run(function($MR, $q){
		var dfd = $q.defer();
        var url = 'http://localhost:8080';	//your moonridge instance
		//Moonridge backend
		var MRB = $MR('local', dfd.promise, true);  //true indicates, that this backend should be used by default
		dfd.resolve({url: url, hs: { query: "nick=admin" } } );	//resolve connects you to the Moonridge backend
	})
    .controller('bookCtrl', function($scope, book){
        // create a book
        book.create({name: 'A Game of Thrones', author: 'George R. R. Martin'});
        // query for it
        var query = book.query().findOne().exec();
        // delete it
        book.remove(query.doc);
        //best for last- liveQuery
        $scope.LQ = book.liveQuery().find().exec();
        //$scope.LQ.docs will contain up to date synced collection of documents that satisfy the query. You can
        //before exec() you can use any mongoose query method except distinct, remove, update
    })
```    
Also you need to connect to your backend-Moonridge uses a promise resolution for this. See [how in the included smoketest](https://github.com/capaj/Moonridge/blob/8faf7ad4b7c6c0301d70c3d8a346348d2b21e86d/e2e-smoketest/mr-test-ctrl.js#L84)

##Errorhandling

All server-client communication is done with [socket.io-rpc](https://github.com/capaj/socket.io-rpc) -another project of mine, so errors are propagated for all server-side calls which return an error(or reject their promise).

Written in commonJS format, so you need to use some module loader like [SystemJS](https://github.com/systemjs/systemjs). Even better is to use [jspm](https://github.com/jspm/jspm-cli).

##TODO
1. make it easier to consume-anyone with plain express app should be able to just install it and run it with 2 additional lines of code.
2. Needs implementing E2E testing scenarios as well as a lot of unit tests.

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

