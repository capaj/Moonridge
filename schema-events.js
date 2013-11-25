var IdGen = require('./simple-ids');

/**
 * @readonly
 * @enum {String}
 * @type {Array}
 */
var eventNames = ['create', 'preupdate', 'update', 'remove'];

function EventBus() {
    var self = this;
    self.subscribers = {};  //TODO use node-hashtable here for better perf
    eventNames.forEach(function (name) {
        self.subscribers[name] = {};
    });

    /**
     * @param {eventNames} name
     * @param previousVersion is used with 'preupdate' event, this is the input we got for update, so it can be diffed
     * @this {Mongoose.Document}
     */
    this.fire = function (name, previousVersion) {
        var evObj = self.subscribers[name];
        for (var i in evObj) {
            evObj[i](this, name, previousVersion);  //stripping away mongoose doc properties, we don't need them for anything
        }
    };
    /**
     *
     * @param {String} evName
     * @param {Function} callback
     */
    this.subscribe = function (evName, callback) {
        var newId = IdGen();
        self.subscribers[evName][newId] = callback;
        return newId;
    };

    /**
     *
     * @param id
     * @param {String} event
     * @returns {bool}
     */
    this.unsubscribe = function (id, event) {
        if (event) {
            if (self.subscribers[event][id]) {
                delete self.subscribers[event][id];
                return true;
            }
        }
        return false;

    };

    this.unsubscribeMany = function (evIds) {
        for (var evName in evIds) {
            evIds.self.unsubscribe(evIds[evName], evName)
        }
    }
}
EventBus.eventNames = eventNames;
module.exports = EventBus;