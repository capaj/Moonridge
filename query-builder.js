var qMethodsEnum = [	//query methods which modifies the collection are not included, those have to be called via RPC methods
	'all',
	'and',
	'box',
	'center',
	'centerSphere',
	'circle',
	'comment',
	'count',
	'distinct',
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
	'limit',
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
	'skip',
	'slice',
	'sort',
	'where',
	'within'
];

module.exports = function (model, qJSON) {
	var query = model.find();

	for(var method in qJSON){
		if (qMethodsEnum.indexOf(method) !== -1) {
			query = query[method](qJSON[method]); // applies one query method at a time, thx to mongoose's chainable query api
		} else {
			return new Error('Method "' + method + '" is not a valid query method.')
		}
	}
	return query;
};