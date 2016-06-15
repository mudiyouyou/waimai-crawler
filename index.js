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

function fetchTask() {
    let beforeDays = 1;
    let tasks = accounts.map((account)=> {
        switch (account.type) {
            case 'meituan':
                return new MeituanTask(account).run(beforeDays);
            case 'eleme':
                return new ElemeTask(account).run(beforeDays);
            case "baidu":
                return new BaiduTask(account).run(beforeDays);
        }
    });
    promise.all(tasks).then((files)=>{
        mail.sendMail(beforeDays, files);
    }).catch((err)=>{
        logger.error(err);
    });
}
later.date.localTime();
let schedule = later.parse.recur().on(6).hour();
later.setInterval(fetchTask,schedule);
logger.info('Waimai Crawler is running');