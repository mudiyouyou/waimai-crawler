const ElemeTask = require('./lib/eleme_task');
const BaiduTask = require('./lib/baidu_task');
const MeituanTask = require('./lib/meituan_task');
const mail = require('./lib/mail');
const logger = require('./lib/logger');
const promise = require('bluebird');
const moment = require('moment');
const config = require('config');
const accounts = config.get('account');
const later = require('later');

function startFetch() {
    let option = {beforeDays: 1};
    let tasks = [];
    accounts.forEach((account)=> {
        switch (account.type) {
            case 'meituan':
                tasks.push(new MeituanTask(account, option).run());
                break;
            case 'eleme':
                tasks.push(new ElemeTask(account,option).run());
                break;
            case "baidu":
                tasks.push(new BaiduTask(account,option).run());
                break;
        }
    });
    promise.all(tasks).then((files)=> {
        logger.info('Will send files :' + files);
        mail.sendMail(option, files);
    }).catch((err)=> {
        logger.error(err);
    });
}
later.date.localTime();
let schedule = later.parse.recur().on(6).hour();
later.setInterval(startFetch,schedule);
logger.info('Waimai Crawler is running');