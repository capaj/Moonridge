var mongoose = require('mongoose');
var collectionsForDrop = ['fighters', 'users'];

collectionsForDrop.forEach(function (coll) {
    mongoose.connection.db.executeDbCommand({drop: coll});
});
