Moonridge   [![NPM version](https://badge.fury.io/js/moonridge.png)](http://badge.fury.io/js/moonridge)
=========

MONgOose bRIDGE to angular.js. Takes your mongoose models and exposes them for easy consumption in the browser for your JS app.

Offers killer feature of Meteor for MEAN stack. How?
##Basic usage serverside

    var mongoose = require('mongoose');
    var Moonridge = require('moonridge');
    var MR = moonridge.init(mongoose);
    ...
    var commentVote = MR.model('book', {
            name: String,
            author: String
        }, {
             schemaInit: function (schema) {
                // makes sure only one vote per nameXauthor exists
                schema.index({ name: 1, author: 1 }, { unique: true, dropDups: true });
            }
        });
    ...
    moonridge.createServer(io, app);

##On the CLIENT side:
###HTML

    <div mr-controller="bookCtrl" mr-model="book"><!--You must use mr-controller instead of ng-controller-->
        <!--whatever you need to show-->
    </div>

###JS

    .controller('bookCtrl, 'function($scope, book){
        // create a book
        book.create({name: 'A Game of Thrones', author: 'George R. R. Martin'});
        // query for it
        book.query().findOne().exec();
        // delete it
        book.remove(book);
        //best for last- liveQuery
        $scope.LQ = book.liveQuery().find().exec();
        //$scope.LQ.docs will contain up to date synced collection of documents that satisfy the query. You can
        //use any query method except distinct, remove, update
    })
    
Also you need to connect to your backend, but that is also very simple. See [test/index.html](https://github.com/capaj/Moonridge/blob/master/test/index.html)

##Errorhandling

This is based on socket.io-rpc project, so errors are propagated for all server-side calls which return an error.

##Supported browsers
###Desktop
    Internet Explorer 8+
    Safari 4+
    Google Chrome 4+
    Firefox 4+
    Opera 10.61+
###Mobile
    iPhone Safari
    iPad Safari
    Android WebKit
    WebOs WebKit
    
##How does live querying work in one paragraph
Every client liveQuery is serialized and sent via socket.io to backend. Backend parses it and constructs real mongoose query, wich is immediately run(if it doesn't exist already in server memory). The return is sent back to client. Any change to a certain document (creation, deletion, update) is checked again for all in-memory queries. MongoDB checks just one recently changed document, not the whole query, so it should be pretty quick. If query is satisfied, the changed document is propagated to listening clients. And that is basically it.

Pull requests are welcome and same goes for new issues!

[![Bitdeli Badge](https://d2weczhvl823v0.cloudfront.net/capaj/moonridge/trend.png)](https://bitdeli.com/free "Bitdeli Badge")

