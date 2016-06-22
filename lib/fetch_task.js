const promise = require('bluebird');
const logger = require('./logger');
const stringify = require('csv-stringify');
const fs = require('fs');
const path = require('path');
const moment = require('moment');
const uuid = require('uuid');
const _ = require('underscore');
class FetchTask {
    constructor(account,option) {
        this.account = account;
        let end = moment().subtract(1,'days').endOf('day');
        let begin = moment().subtract(option.beforeDays, 'days').startOf('day');
        logger.info(`Start fetch ${account.name} from ${begin.format('YYYY-MM-DD')} to ${end.format('YYYY-MM-DD')} orders`);
        this.option = {
            beginTime: begin,
            endTime: end
        };
        this.columns = {};
    }

    run() {
        return this.preFetch().then(this.fetch.bind(this)).then(this.postFetch.bind(this));
    }

    preFetch() {
        logger.info(`preFetch ${this.account.name}`);
        return this.login();
    }

    setToken(token){
        this.token = token;
        logger.info(`${this.account.name} gets token :${JSON.stringify(token)}`);
    }

    fetch() {
        logger.info(`fetch ${this.account.name}`);
        return this.fetchPageAmount().then(this.fetchPages.bind(this));
    }

    login() {
        return;
    }

    fetchPageAmount(){
        return 0;
    }

    fetchPages(pageAmount) {
        let tasks = [];
        for (let pageNum = 1; pageNum <= pageAmount; pageNum++) {
            tasks.push(this.fetchPage(pageNum));
        }
        return promise.all(tasks).then((result)=> {
            return _.flatten(result);
        });
    }

    postFetch(orders){
        logger.info(`postFetch ${this.account.name}`);
        return this.convertToReport(orders).then(this.convertToCSV.bind(this));
    }

    convertToReport(orders){
        return orders;
    }

    convertToCSV(orders) {
        logger.info(`convertToCSV ${this.account.name}`);
        let option = {
            header: true,
            columns: this.columns,
            quotedString: true
        };
        var begin = this.option.beginTime.format('YYYY-MM-DD');
        var end = this.option.endTime.format('YYYY-MM-DD');
        let reportFile = this.account.name + begin + '_' + end + '_' + uuid.v4().substr(-4, 4) + '.csv';
        let reportPath = path.resolve(__dirname, '../temp', reportFile);
        return new promise(function (resolve, reject) {
            stringify(orders, option, function (err, output) {
                if (err) {
                    reject(err);
                }
                fs.appendFile(reportPath, output, {
                    encoding: 'utf8',
                    flag: 'w+'
                }, function (err) {
                    if (err) return reject(err);
                    logger.info('Generate a report names ' + reportPath);
                    resolve(reportPath);
                });
            });
        });
    }
}
module.exports = FetchTask;