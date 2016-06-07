const request = require('request');
const promise = require('bluebird');
promise.promisifyAll(request);
const logger = require('./logger');
const uuid = require('uuid');
const config = require('config');
const moment = require('moment');
const stringify = require('csv-stringify');
const fs = require('fs'), path = require('path');
const _ = require('underscore');
promise.promisifyAll(fs);

function run(account,beforeDays) {
    let end = moment().startOf('day');
    let begin = moment().startOf('day').subtract(beforeDays, 'days');
    let queryParam = {
        beginTime: begin.unix(),
        endTime: end.unix()
    };
    let toFetch = _.partial(fetch, queryParam);
    let toPostFetch = _.partial(postFetch, account, queryParam);
    return preFetch(account).then(toFetch).then(toPostFetch);
}
exports.run = run;

function preFetch(account) {
    let cacheFile = path.resolve(__dirname, '../cache.json');
    return fs.readFileAsync(cacheFile).then((data) => {
        let cache = JSON.parse(data.toString());
        let context = cache[account.name];
        if (!context) {
            return login(account).then(function (loginRes) {
                //logger.debug(loginRes);
                context = loginRes;
                cache[account.name] = context;
                fs.writeFile(cacheFile, JSON.stringify(cache));
                return context;
            });
        } else {
            return context;
        }
    });
}

function login(account) {
    let loginURL = ' https://app-api.shop.ele.me/invoke?appName=melody&appVersion=0.1.0 ';
    let loginParam = {
        "id": uuid.v4(),
        "type": "invoke.request",
        "method": "secure.login.loginByUsername",
        "params": {
            "username": account.username,
            "password": account.password,
            "captcha": "",
            "mobile": "",
            "verifyCode": "",
            "logined": []
        },
        "ncp": "1.0.0"
    };
    let loginOption = {
        body: loginParam,
        //proxy: 'http://127.0.0.1:8888',
        headers: {
            'User-Agent': 'Rajax/1 PC/1 Windows/6.1_x64 Napos/4.2.3 ID/D84C31D7-C42D-4AD3-A39F-9D011566F0C6',
            'Origin': 'http://melody.shop.ele.me'
        },
        strictSSL: false,
        json: true
    };
    return request.postAsync(loginURL, loginOption).then((res) => {
        let result = res.body.result;
        return {ksid: result.ksid, restaurantId: result.restaurants[0].id};
    });
}

function fetch(queryParam, context) {
    //logger.debug(context);
    let toFetchPages = _.partial(fetchPages, queryParam, context);
    return fetchPageStat(queryParam, context).then(toFetchPages);
}

function fetchPageStat(queryParam, context) {
    let getOrdersStatURL = 'https://app-api.shop.ele.me/order/invoke/?method=order.getProcessedOrderStats';
    let getOrdersStatParam = {
        "id": uuid.v4(),
        "method": "getProcessedOrderStats",
        "service": "order",
        "metas": {"appName": "melody", "appVersion": "4.4.0", "ksid": context.ksid},
        "ncp": "2.0.0",
        "params": {
            "restaurantId": context.restaurantId,
            "query": {
                "beginTime": queryParam.beginTime,
                "endTime": queryParam.endTime,
                "statuses": [],
                "payments": [],
                "refundStatuses": [],
                "ascending": false
            }
        }
    };
    let getOrdersStatOption = {
        body: getOrdersStatParam,
        //proxy: 'http://127.0.0.1:8888',
        headers: {
            'User-Agent': 'Rajax/1 PC/1 Windows/6.1_x64 Napos/4.2.3 ID/D84C31D7-C42D-4AD3-A39F-9D011566F0C6',
            'Origin': 'http://melody.shop.ele.me'
        },
        strictSSL: false,
        json: true
    };
    return request.postAsync(getOrdersStatURL, getOrdersStatOption).then((res) => {
        let result = res.body.result;
        //logger.debug(result);
        return result.count;
    });
}

function fetchPages(queryParam, context, count) {
    //logger.debug(count);
    let countPerPage = 25;
    let toFetchPage = _.partial(fetchPage, queryParam, context, countPerPage);
    let pageCount = Math.ceil(count / countPerPage);
    let fetches = [];
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
        fetches.push(toFetchPage(pageNum));
    }
    return promise.all(fetches).then((result)=> {
        return _.flatten(result);
    });
}

function fetchPage(queryParam, context, countPerPage, pageNum) {
    //logger.debug(pageNum);
    let getOrdersURL = 'https://app-api.shop.ele.me/order/invoke/?method=order.getProcessedOrders';
    let getOrdersParam = {
        "id": uuid.v4(),
        "method": "getProcessedOrders",
        "service": "order",
        "params": {
            "restaurantId": context.restaurantId,
            "offset": (pageNum - 1) * countPerPage,
            "limit": countPerPage,
            "query": {
                "beginTime": queryParam.beginTime,
                "endTime": queryParam.endTime,
                "statuses": [],
                "payments": [],
                "refundStatuses": [],
                "ascending": false
            }
        },
        "metas": {"appName": "melody", "appVersion": "4.4.0", "ksid": context.ksid},
        "ncp": "2.0.0"
    };
    let getOrdersOption = {
        body: getOrdersParam,
        //proxy: 'http://127.0.0.1:8888',
        headers: {
            'User-Agent': 'Rajax/1 PC/1 Windows/6.1_x64 Napos/4.2.3 ID/D84C31D7-C42D-4AD3-A39F-9D011566F0C6',
            'Origin': 'http://melody.shop.ele.me'
        },
        strictSSL: false,
        json: true
    };
    getOrdersParam.params.offset = (pageNum - 1) * countPerPage;
    return request.postAsync(getOrdersURL, getOrdersOption).then((res) => {
        return res.body.result;
    });
}

function postFetch(account, queryParam, orders) {
    let toConvertToCSV = _.partial(convertToCSV, account, queryParam);
    return convertToReport(orders).then(toConvertToCSV);
}

function convertToCSV(account, queryParam, orders) {
    let columns = {
        id: '订单号',
        order_create_time: '下单时间',
        consigneeName: '姓名',
        consigneePhones: '电话',
        consigneeAddress: '送餐地址',
        product_details: '订购的产品',
        distance: '距离',
        remark: '备注',
        goodsTotal: '原价',
        deliveryFee: '配送费',
        activityTotal: '折扣成本',
        income: '实际收入'
    };
    let option = {
        header: true,
        columns: columns
    };

    var begin = moment.unix(queryParam.beginTime).format('YYYY-MM-DD');
    var end = moment.unix(queryParam.endTime).format('YYYY-MM-DD');
    let reportPath = account.name + begin + '_' + end + '_' + uuid.v4().substr(-4, 4) + '.csv';
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

function convertToReport(orders) {
    _.each(orders, (order)=> {
        let details = [];
        _.each(order.groups, (group)=> {
            _.each(group.items, (item)=> {
                details.push(item.name + ' * ' + item.quantity);
            });
        });
        order.id = order.id + '_';
        order.consigneePhones = _.first(order.consigneePhones);
        order.order_create_time = moment.unix(order.activeTime).format('YYYY/MM/DD HH:mm');
        order.product_details = details.join(' | ');
    });
    return promise.resolve(orders);
}