var _ = require('lodash');
/**
 *
 * @param {Mongoose.Document} mDoc
 * @param {Object|String} populateCQ
 * @param callback
 */
module.exports = function (mDoc, populateCQ, callback) {

    if (Array.isArray(populateCQ)) {	// if it is one of SAA, then we won't call it with apply
        mDoc.populate.apply(mDoc, populateCQ);
    } else {
        if (_.isObject(populateCQ) && populateCQ.mrMultiCall) {
            delete populateCQ.mrMultiCall;
            for (var callIndex in populateCQ) {
                mDoc.populate.apply(mDoc, populateCQ[callIndex]);
            }
        } else {
            mDoc.populate(populateCQ);
        }
    }
    mDoc.populate(callback);
};