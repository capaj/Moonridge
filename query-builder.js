var qMethodsEnum = [	//query methods which modifies the collection are not included, those have to be called via RPC methods
	'all',
	'and',
	'box',
	'center',
	'centerSphere',
	'circle',
	'comment',
//	'count',		//this is query option done in server memory, so you can use it on client
//	'distinct',		//must be done in server memory, TODO implement this
	'elemMatch',
	'equals',
	'exists',
	'find',
	'findOne',
	'geometry',
	'gt',
	'gte',
	'hint',
	'in',
	'intersects',
	'lean',
	'limit', //is not sent to the DB, skipping and limiting is done in memory because it would be a problem for liveQueries
	'lt',
	'lte',
	'maxDistance',
	'maxScan',
	'mod',
	'ne',
	'near',
	'nearSphere',
	'nin',
	'nor',
	'or',
	'polygon',
	'populate',
	'read',
	'regex',
	'select',
	'size',
	'skip',	//is not sent to the DB, skipping and limiting is done in memory because it would be a problem for liveQueries
	'slice',
	'sort',	//must be a string, does not accept an array
	'where',
	'within'
];

var singleArrayArgument = [	//methods which require an array as a single argument
	'or', 'nor', 'and'
];

module.exports = function (model, qJSON) {
	var query = model.find().lean();

	for(var method in qJSON){
		if (qMethodsEnum.indexOf(method) !== -1) {
			var arg = qJSON[method];
			if (Array.isArray(arg) && singleArrayArgument.indexOf(method) === -1) {	// if it is one of SAA, then we won't call it with apply
				query = query[method].apply(query, arg);
			} else {
				query = query[method](arg); // applies one query method at a time, thx to mongoose's chainable query api
			}
		} else {
			return new Error('Method "' + method + '" is not a valid query method.')
		}
	}
	return query;
};