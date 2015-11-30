module.exports = function resolve (obj, path) {
  if (typeof path !== 'string') {
    throw new TypeError('path must be a string')
  }
  return path.split('.').reduce(function (prev, curr) {
    return prev[curr]
  }, obj || this)
}
