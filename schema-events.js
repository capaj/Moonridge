var IdGen = require('./simple-ids');

/**
 * @readonly
 * @enum {String}
 * @type {Array}
 */
var eventNames = ['create', 'update', 'remove'];


function EventBus() {
    var self = this;
    self.subscribers = {};  //TODO use node-hashtable here for better perf
    eventNames.forEach(function (name) {
        self.subscribers[name] = {};
    });

    /**
     * @param {eventNames} name
     * @this {Mongoose.Document}
     */
    this.fire = function (name) {
        var evObj = self.subscribers[name];
        for (var i in evObj) {
            evObj[i](this, name);
        }
    };
    /**
     *
     * @param {Function} callback
     */
    this.subscribe = function (callback) {
        var newId = IdGen();
        self.subscribers[event][newId] = callback;
    };

    /**
     *
     * @param id
     * @param {String} event
     * @returns {bool|Object}
     */
    this.unsubscribe = function (id, event) {
        if (event) {
            if (Array.isArray(event)) {
                var unsubscribed = {};
                event.forEach(function (evName) {
                    unsubscribed[evName] = self.unsubscribe(id, evName);
                });
                return unsubscribed;
            } else {
                if (self.subscribers[event][id]) {
                    delete self.subscribers[event][id];
                    return true;
                } else {
                    return false;
                }
            }
        }
    };
}

module.exports = EventBus;