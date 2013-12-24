var _ = require('lodash');
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

/**
 *
 * @param {Mongoose.Model} model
 * @param {Object} clientQuery received JSON deserialized
 * @returns {Query|Error}
 */
module.exports = function (model, clientQuery) {
	var query = model.find().lean();

	for(var method in clientQuery){
		if (qMethodsEnum.indexOf(method) !== -1) {
			var arg = clientQuery[method];
			if (Array.isArray(arg)) {	// if it is one of SAA, then we won't call it with apply
				query = query[method].apply(query, arg);
			} else if (_.isObject(arg)) {
                for (var callIndex in arg) {
                    query = query[method].apply(query, arg[callIndex]);
                }
            } else {
                return new Error('Method arguments for "' + method + '" must be array or object, query builder cannot parse this')
            }

		} else {
			return new Error('Method "' + method + '" is not a valid query method.')
		}
	}
	return query;
};