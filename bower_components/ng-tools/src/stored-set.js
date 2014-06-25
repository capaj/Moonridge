/**
 * set which is automatically stored in local storage, offers events to hook up syncing to the server, depends on
 * storage injectable. storage injectable must have "get(key)" and "set(key, value)" method
 */
angular.module('ngTools').factory('StoredSet',
    /**
     *
     * @param Set
     * @param {Object} storage
     * @param {Function} storage.get
     * @param {Function} storage.set
     * @param $log
     * @returns {Function}
     */
    function (Set, storage, $log) {
	/**
	 * @param {Object} opts typical call option object would look like:  {hashFn: .., storageKey: 'LSkey'}
     * @param {Function} opts.hashFn function for hashing
     * @param {string} opts.storageKey key for storing the set
	 * @constructor
	 */
	function StoredSet(opts) {
        var self = this;
        if (!opts.storageKey) {
            $log.error("storageKey property must be provided for storedSet");
            return;
        }
        angular.extend(self, opts);

        /**
         * @type {Set}
         */
        this.set = new Set(self.hashFn);

        this.onInit(storage.get(self.storageKey));
    }
	/**
	 * Prototype
	 * @type {{add: Function, addReplace: Function, remove: Function, toArray: Function, onAdd: Function, onRemove: Function, onInit: Function}}
	 */
    StoredSet.prototype = {
		/**
		 * @param {*} item
		 * @param {boolean} [skipSave]
		 * @returns {boolean} true when item added, false when not added
		 */
		add: function (item, skipSave) {
			var added = this.set.add(item);
			this.onAdd(item, added);
			added && this.save(skipSave);
			return added;
		},
		/**
		 * @param {*} item
		 * @param {boolean} [skipSave] if true, then the save to storage will be skipped
		 */
        addReplace: function (item, skipSave) {
			var replaced = this.set.addReplace(item);
            this.onAdd(item, replaced);
            this.save(skipSave);
			return !replaced;
        },
	    /**
	     * Remove from storage
	     * @param item
	     * @returns {boolean}
	     */
        remove: function (item) {
			var removed = this.set.remove(item);
			if (removed) {
                this.save();
                this.onRemove(item);
            }
			return removed;
        },
	    /**
	     * each similar to forEach with arrays
	     */
	    each: function(){
		    return this.set.each.apply(this.set, arguments);
	    },
	    /**
	     * To array
	     * @returns {Array}
	     */
        toArray: function () {
            return this.set.toArray();
        },
		/**
		 * @param skip the save
		 */
		save: function (skip) {
			!skip && storage.set(this.storageKey, angular.copy(this.toArray())); // angular.copy removes $$hashKey
		},
        //events
        onAdd: function (item, replaced) {},
        onRemove: function (item) {},
        onInit: function (cached) {
            if (cached && Array.isArray(cached)) {
                cached.forEach(angular.bind(this, function (obj) {
					this.add(obj, true);
                }) );
            }

        }
    };
    return StoredSet;
});

