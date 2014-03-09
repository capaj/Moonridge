function isInt(n) {
    return typeof n === 'number' && n % 1 == 0;
}

var noop = function (args) {
    return true;
};

var singleNumberValidation = function (args) {
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
 * @type {Object.<string, Function>} name of the method and validation function
 */
module.exports = {	//query methods which modifies the collection are not included, those have to be called via RPC methods
    all: noop,
    and: noop,
    box: noop,
    center: noop,
    centerSphere: noop,
    circle: noop,
    comment: noop,
    //    count: noop,      //this is query option done in server memory, so you can use it on client
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
    limit: singleNumberValidation,  //is not sent to the DB, skipping and limiting is done in memory because it would be a problem for liveQueries
    lt: noop,
    lte: noop,
    maxDistance: noop,
    maxScan: singleNumberValidation,
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
    skip: singleNumberValidation,	//is not sent to the DB, skipping and limiting is done in memory because it would be a problem for liveQueries
    slice: noop,
    sort: noop,     //must be a string, does not accept an array
    where: function (args) {
        if (args.length > 0 && args.length <= 2) {
            return true;    //TODO check types here
        }
        return new Error('Method was called with wrong number of arguments');
    },
    within: noop
};
