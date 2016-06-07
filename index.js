const meituan = require('./lib/meituan');
const eleme = require('./lib/eleme');
const mail = require('./lib/mail');
const logger = require('./lib/logger');
const promise = require('bluebird');
const moment = require('moment');
const config = require('config');
const _ = require('underscore');
const accounts = config.get('account');
const later = require('later');
function fetchTask(){
    let tasks = [];
    let beforeDays = 1;
    _.map(accounts, function (account) {
        switch (account.type) {
            case 'meituan':
                tasks.push(meituan.run(account, beforeDays));
                break;
            case 'eleme':
                tasks.push(eleme.run(account, beforeDays));
                break;
        }
    });
    promise.all(tasks).then(function (files) {
        mail.sendMail(beforeDays, files);
    }).catch(function (err) {
        logger.error(err);
    });
}
//later.date.localTime();
//let schedule = later.parse.recur().on(6).hour();
//later.setInterval(fetchTask,schedule);
fetchTask();