var log4js = require('log4js'); 
var config = require('config');
logger = log4js.getLogger();
logger.setLevel(config.get('log.level'));
module.exports = logger;