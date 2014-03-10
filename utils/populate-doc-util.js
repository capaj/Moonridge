var _ = require('lodash');
/**
 *
 * @param {Mongoose.Document} mDoc
 * @param {Array<Array<*>>} populateInvocations each item contains array of arguments to use for each populate call
 * @param callback
 */
module.exports = function populateParser(mDoc, populateInvocations, callback) {

    if (Array.isArray(populateInvocations)) {
        var i = 0;
        while (i < populateInvocations.length) {
            mDoc.populate.apply(mDoc, populateInvocations[i]);
            i++;
        }
    } else {
        return new Error('Method arguments for "populate" must be an Array, populate parser cannot parse this')
    }

    mDoc.populate(callback);
};