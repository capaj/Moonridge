var _ = require('lodash');
/**
 *
 * @param {Mongoose.Document} mDoc
 * @param {Object|Array} populateCQ
 * @param callback
 */
module.exports = function populateParser(mDoc, populateCQ, callback) {

    if (Array.isArray(populateCQ)) {	// if it is one of SAA, then we won't call it with apply
        mDoc.populate.apply(mDoc, populateCQ);
    } else if (_.isObject(populateCQ)) {
        for (var callIndex in populateCQ) {
            mDoc.populate.apply(mDoc, populateCQ[callIndex]);
        }
    } else {
        return new Error('Method arguments for "populate" must be array or object, populate parser cannot parse this')
    }

    mDoc.populate(callback);
};