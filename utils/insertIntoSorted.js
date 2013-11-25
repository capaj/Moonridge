/**
 *
 * @param {Object} element
 * @param {Array<Object>} array sorted
 * @param {Array<String>} sortBy keys
 * @returns {Number} index of the item in the sorted array
 */
module.exports = function insert(element, array, sortBy) {
	var isLowerSorted = function isLowerSorted(first, second) {
		var i = 0;
		var prop = sortBy[0];

		while(sortBy[i]) {
			if (prop[0] === '-') {
				prop = prop.slice(1);

				if (first[prop] < second[prop]) {
					return false;
				}
				if (first[prop] > second[prop]) {
					return true;
				} else {
					i += 1;
					prop = sortBy[i];
				}

			} else {
				if (first[prop] < second[prop]) {
					return true;
				}
				if (first[prop] > second[prop]) {
					return false;
				} else {
					i += 1;
					prop = sortBy[i];
				}
			}

		}
        return true;

	};

	var locationOf = function locationOf(element, array, start, end) {
		start = start || 0;
		end = end || array.length;
		var pivot = parseInt(start + (end - start) / 2);
        console.log("pivot: " + pivot + ' start: ' + start + ' end: ' + end);
		if(end - start <= 1 || array[pivot]._id.id === element._id.id) return pivot;

		if(isLowerSorted(array[pivot], element)) {
			return locationOf(element, array, pivot, end);
		} else{
			return locationOf(element, array, start, pivot);
		}
	};

	var index = locationOf(element, array);
	return index;
};