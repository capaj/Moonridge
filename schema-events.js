var IdGen = require('./simple-ids');
var _ = require('lodash');
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

    var methods =  {
        /**
         * @param {eventNames} name
         * @param previousVersion is used with 'preupdate' event, this is the input we got for update, so it can be diffed
         * @this {Mongoose.Document}
         */
        fire: function (name, previousVersion) {
            var evObj = self.subscribers[name];
            for (var i in evObj) {
                evObj[i](this, name, previousVersion);  //stripping away mongoose doc properties, we don't need them for anything
            }
        },
        /**
         * subscribe alias method for subscribing to events
         * @param {String|Array<String>} event
         * @param {Function} callback
         * @returns {*}
         */
        subscribe: function on(event, callback) {
            if (Array.isArray(event)) {
                event.forEach(function (ev) {
                    on(ev, callback);
                });
            } else {
                if(typeof callback == 'function') {
                    var newId = IdGen();
                    self.subscribers[event][newId] = callback;
                    return newId;
                } else {
                    throw new Error('Callback is something else than a function');
                }
            }

        },
        /**
         *
         * @param id
         * @param {String} event
         * @returns {bool}
         */
        unsubscribe: function (id, event) {
            if (event) {
                if (self.subscribers[event][id]) {
                    delete self.subscribers[event][id];
                    return true;
                }
            }
            return false;

        }

    };
    _.extend(this, methods);

}

EventBus.eventNames = eventNames;

module.exports = EventBus;