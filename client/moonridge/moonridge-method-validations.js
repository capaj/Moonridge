
function isInt(n) {
    return typeof n === 'number' && n % 1 == 0;
}

var noop = function () {
    return true;
};

var singleIntegerValidation = function (args) {
    if (args.length === 1) {
        if (isInt(args[0])) {
            return true;
        } else {
            return new TypeError('Argument must be an integer');
        }
    }
    return new Error('Method must be called with exactly one Number argument');
};

/**
 * query methods which modifies the collection are not included, those have to be called via RPC methods
 * @type {Object.<string, Function>} name of the method and validation function
 */
var qMethodsEnum = {
    all: noop,
    and: noop,
    box: noop,
    center: noop,
    centerSphere: noop,
    circle: noop,
    comment: noop,
    count: noop,    //available on client, but done in server memory, not sent to DB queries
    //	distinct: noop,		//must be done in server memory, TODO implement this
    elemMatch: noop,
    equals: noop,
    exists: noop,
    find: noop,
    findOne: function (args) {
        if (args.length === 0) {
            return true;
        } else {
            if (args.length > 1) {
                return new Error("FindOne does not take more than one argument");
            }
            if (typeof args[0] !== 'object') {
                return new TypeError("FindOne takes just one Object as argument");
            }
            return true;
        }
    },
    geometry: noop,
    gt: noop,
    gte: noop,
    hint: noop,
    in: noop,
    intersects: noop,
//		lean: noop, //always enabled
    limit: singleIntegerValidation,
    lt: noop,
    lte: noop,
    maxDistance: noop,
    maxScan: singleIntegerValidation,
    mod: noop,
    ne: noop,
    near: noop,
    nearSphere: noop,
    nin: noop,
    nor: noop,
    or: noop,
    polygon: noop,
    populate: noop,
    read: noop,
    regex: noop,
    select: noop,
    size: noop,
    skip: singleIntegerValidation,	//is not sent to the DB, skipping and limiting is done in memory because it would be a problem for liveQueries
    slice: noop,
    sort: noop,
    where: function (args) {
        if (args.length > 0 && args.length <= 2) {
            return true;    //TODO check types here
        }
        return new Error('Method was called with wrong number of arguments');
    },
    within: noop
};

module.exports = qMethodsEnum;
