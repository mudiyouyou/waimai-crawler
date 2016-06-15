const promise = require('bluebird');
const logger = require('./logger');
const stringify = require('csv-stringify');
const fs = require('fs');
const path = require('path');
const moment = require('moment');
const uuid = require('uuid');
class FetchTask {
    constructor(account) {
        this.account = account;
    }

    convertToCSV(columns, orders) {
        let option = {
            header: true,
            columns: columns,
            quotedString: true
        };
        var begin = this.queryParam.beginTime.format('YYYY-MM-DD');
        var end = this.queryParam.endTime.format('YYYY-MM-DD');
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
                    resolve(reportPath);
                });
            });
        });
    }

}
module.exports = FetchTask;