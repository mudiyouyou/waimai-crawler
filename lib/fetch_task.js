const promise = require('bluebird');
const logger = require('./logger');
const stringify = require('csv-stringify');
const fs = require('fs');
const path = require('path');
const moment = require('moment');
const uuid = require('uuid');
const _ = require('underscore');
/*  爬虫任务的父类
 *   定义抓取流程，各步骤的内容
 *   抽取出统一的json to csv生成代码
 */
class FetchTask {
    /*  account:{username:String,password:String}
     option:{beginTime:moment,endTime:moment}
     */
    constructor(account,option) {
        this.account = account;
        let begin = moment().utc().utcOffset(8).subtract(option.beforeDays, 'days').startOf('day');
        let end = moment().utc().utcOffset(8).subtract(option.beforeDays,'days').endOf('day');
        logger.info(`Start fetch ${account.name} from ${begin.format('YYYY-MM-DD')} to ${end.format('YYYY-MM-DD')} orders`);
        this.option = {
            beginTime: begin,
            endTime: end
        };
        //logger.debug(this.option.beginTime.format('YYYY-MM-DDTHH:mm:ss.SSS'));
        //logger.debug(this.option.endTime.format('YYYY-MM-DDTHH:mm:ss.SSS'));
        this.columns = {};
    }

    //  任务执行主方法
    run() {
        return this.preFetch().then(this.fetch.bind(this)).then(this.postFetch.bind(this));
    }
    // 抓取前的准备工作
    preFetch() {
        logger.info(`preFetch ${this.account.name}`);
        return this.login();
    }
    // 保存登录凭证
    setToken(token){
        this.token = token;
        logger.info(`${this.account.name} gets token :${JSON.stringify(token)}`);
    }
    //  执行抓取
    fetch() {
        logger.info(`fetch ${this.account.name}`);
        return this.fetchPageAmount().then(this.fetchPages.bind(this));
    }
    //  登录步骤需要子类实现
    login() {
        return;
    }
    //  抓取分页总数
    fetchPageAmount(){
        return 0;
    }
    //  抓取所有分页上的数据
    fetchPages(pageAmount) {
        let tasks = [];
        for (let pageNum = 1; pageNum <= pageAmount; pageNum++) {
            tasks.push(this.fetchPage(pageNum));
        }
        return promise.all(tasks).then((result)=> {
            return _.flatten(result);
        });
    }
    //  抓取之后的操作，主要是对原始数据转换，格式转换，数据输出
    postFetch(orders){
        logger.info(`postFetch ${this.account.name}`);
        return this.convertToReport(orders).then(this.convertToCSV.bind(this));
    }
    //  原始数据格式转换
    convertToReport(orders){
        return orders;
    }
    //  在postFetch中将数据转换成csv格式并生成文件
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