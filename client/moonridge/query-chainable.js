var MRMethodsClientValidations = require('./moonridge-method-validations');
//Moonridge methods which aren't run against the DB but rather just in memory
var callJustOnce = [
    'findOne',
    'select',
    'count',
    'sort',
    'limit',
    'skip'
];

/**
 * is used for emulating mongoose query
 * @param {Object} queryMaster
 * @param {Function} execFn which always returns a promise
 * @param {Model} model
 * @constructor
 */
function QueryChainable(queryMaster, execFn, model) {
    var self = this;
    this.exec = execFn;
    this._model = model;

    var APslice = Array.prototype.slice;

    var createMethod = function (method) {
        self[method] = function () {
            var argsArray = APslice.call(arguments);

            //perform validation
            var validationResult = MRMethodsClientValidations[method](argsArray);
            if (validationResult instanceof Error) {
                throw validationResult;
            }
            var qr = queryMaster.query;

            if (callJustOnce.indexOf(method) !== -1) {
                if (queryMaster.indexedByMethods[method]) {

                    var qrIndex = qr.length;
                    while(qrIndex--) {
                        if (qr[qrIndex].mN === method) {
                            qr.splice(qrIndex, 1);  //remove from query array because
                        }
                    }
                }

                queryMaster.indexedByMethods[method] = argsArray; //we shall add it to the options, this object will be used when reiterating on LQ

            }

            qr.push({mN: method, args: argsArray});

            return self;
        };
    };

    for (var method in MRMethodsClientValidations) {
        createMethod(method);
    }

}

module.exports = QueryChainable;
