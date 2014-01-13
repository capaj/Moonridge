/**
 *
 * @param {Object} obj
 * @param {Array<String>} accessorStrings
 * @returns {*}
 */
var getValueForProp = function (obj, accessorStrings) {
    var prop = obj;
    while(accessorStrings.length) {
        prop = prop[accessorStrings[0]];
        accessorStrings = accessorStrings.slice(1);
    }
    return prop;
};

/**
 *
 * @param {Object} element
 * @param {Array<Object>} array sorted
 * @param {Array<String>} sortBy keys
 * @returns {Number} index of the item in the sorted array
 */
module.exports = function getIndexForElement(element, array, sortBy) {
	/**
	 *
	 * @param first	element of an array
	 * @param second element of an array
	 * @returns {boolean} true when first should precede second
	 */
	var isLowerSorted = function isLowerSorted(first, second) {
		var i = 0;
		var prop = sortBy[0];
        var firstVal;
        var secondVal;
        var accesorStrings;

		while(sortBy[i]) {
			if (prop[0] === '-') {
				prop = prop.slice(1);
                accesorStrings = prop.split('.');
                firstVal = getValueForProp(first, accesorStrings);
                secondVal = getValueForProp(second, accesorStrings);
                if (firstVal < secondVal) {
					return false;
				}
				if (firstVal > secondVal) {
					return true;
				} else {
					i += 1;
					prop = sortBy[i];
				}

			} else {
                accesorStrings = prop.split('.');
                firstVal = getValueForProp(first, accesorStrings);
                secondVal = getValueForProp(second, accesorStrings);
				if (firstVal < secondVal) {
					return true;
				}
				if (firstVal > secondVal) {
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
//        console.log("pivot: " + pivot + ' start: ' + start + ' end: ' + end);
		if(end - start <= 1) return pivot;

		if(isLowerSorted(array[pivot], element)) {
			return locationOf(element, array, pivot, end);
		} else{
			return locationOf(element, array, start, pivot);
		}
	};

	var index = locationOf(element, array);
	if (index === 0) {
        if (array.length === 0) {
            return 0;
        }
        if(isLowerSorted(element, array[0])) {
			return 0;
		} else {
			return index + 1;
		}
	} else {
		return index + 1;
	}
};