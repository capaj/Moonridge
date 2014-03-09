var winston = require('winston');
var env = process.env.NODE_ENV;
var name = env || 'development';

var cfg = require('./' + name);

var logger = new (winston.Logger)({
    transports: [
        new (winston.transports.Console)(cfg.logOpts)
//        new (winston.transports.File)({ filename: 'moonridge.log' })
    ]
});
module.exports = logger;