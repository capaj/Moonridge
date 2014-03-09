var _ = require('lodash');
var mongooseMethodValidations = require('./mongoose-method-validations');
var maxQueryLength = 70;    //hardcoded max query length
var qMethodsEnum = [];

for (var method in mongooseMethodValidations) {
    qMethodsEnum.push(method);
}

var callJustOnce = [
    'findOne',
    'select',
    'populate',
    'count',
    'sort',
    'limit',
    'skip'
];


/**
 *
 * @param {Mongoose.Model} model
 * @param {Array<Object>} clientQuery received JSON deserialized
 * @returns {Query|Error}
 */
module.exports = function (model, clientQuery) {
	var query = model.find().lean();
    var opts = {};

    function addToOpts(prop, val) {
        if (opts[prop]) {
            throw new Error('you can');
        }
    }

    if (!Array.isArray(clientQuery)) {
        throw new TypeError('Query must be an array');
    }
    if (clientQuery.length > maxQueryLength) {
        throw new Error('Maximum query length of the query is bigger than allowed');
    }

    var ind = 0;
    while(clientQuery[ind]){
        var methodName = clientQuery[ind].mN;   //short for methodName
        if (qMethodsEnum.indexOf(methodName) !== -1) {
            var arg = clientQuery[ind].args;


            if (callJustOnce.indexOf(methodName) !== -1) {
                if (methodName === 'sort' && opts.count) {
                    throw new Error('Mongoose does not support sort and count in one query');
                }

                if (opts[methodName]) {
                    throw new Error(methodName + ' method can be called just once per query');
                } else {
                    opts[methodName] = arg; //we shall add it to the options, this object will be used when reiterating on LQ
                }

            }


            if (Array.isArray(arg)) {	// if it is one of SAA, then we won't call it with apply
                var validationResult = mongooseMethodValidations[methodName](arg);
                if (validationResult instanceof Error) {
                    throw validationResult;
                }
                query = query[methodName].apply(query, arg);
            } else {
                throw new TypeError('Method arguments for "' + methodName + '" must be array, query builder cannot parse this')
            }

        } else {
            if (methodName === 'count') {
                opts.count = true;
            } else {
                throw new Error('Method "' + methodName + '" is not a valid query method.')
            }
        }
        ind += 1;
    }
	return {opts: opts, mQuery: query};
};