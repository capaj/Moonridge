var Promise = require('bluebird');

Promise.when = function(promiseOrValue) {
  if (typeof promiseOrValue === 'object' && typeof promiseOrValue.then === 'function') {
    return promiseOrValue;
  } else {
    var dfd = Promise.defer();
    dfd.resolve(promiseOrValue);
    return dfd.promise;
  }
};

Promise.when({a:11}).then(function(val){
    console.log("val", val);
});