const request = require('request');
const promise = require('bluebird');
const logger = require('./logger');
const qs = require('querystring');
const config = require('config');
const moment = require('moment');
const stringify = require('csv-stringify');
const fs = require('fs'), path = require('path');
const uuid = require('uuid');
promise.promisifyAll(request);
promise.promisifyAll(fs);
const baiduURL = 'http://wmcrm.baidu.com';
const _ = require('underscore');
const jsdom = require('jsdom');

preFetch().then((context)=> {
    return fetch(context);
}).then(postFetch).catch((err)=> {
    logger.error(err);
});

function fetch(context) {
    const fetchPages = generateFetchPages(context);
    return fetchPages(1);
}

function preFetch() {
    var cacheFile = path.resolve(__dirname, '../cache.json');
    return fs.readFileAsync(cacheFile).then((data)=> {
        var context = JSON.parse(data);
        return context;
    });
}
const Cookie = require("tough-cookie").Cookie;
const jquery = fs.readFileSync(path.resolve(__dirname, './jquery.min.js'), 'utf-8');
function generateFetchPages(context) {
    var orderJar = jsdom.createCookieJar();
    context.baidu.cookies.split(';').forEach((v)=> {
        orderJar.setCookie(Cookie.parse(v), baiduURL, function () {
        });
    });
    var yesterday = moment().add(-1, 'd').format('YYYY-MM-DD');
    var orderParam = {
        qt: 'orderlist',
        start_time: yesterday,
        end_time: yesterday,
        send_time_start: yesterday,
        send_time_end: yesterday
    };
    var getOrderURL = 'http://wmcrm.baidu.com/crm?' + qs.stringify(orderParam);
    return function (pageNum) {
        return new promise(function (resolve, reject) {
            jsdom.env({
                url: getOrderURL + '&page=' + pageNum,
                cookieJar: orderJar,
                src: [jquery],
                features: {
                    FetchExternalResources: ["script"],
                    ProcessExternalResources: ['script'],
                    SkipExternalResources: false
                },
                proxy: 'http://127.0.0.1:8888',
                done: function (err, window) {
                    if (err) return reject(err);
                    var orders = convertToOrders(window);
                    resolve(orders);
                }
            });
        });
    };
}

function convertToOrders(window) {
    var $ = window.$;

        var orders = [];
        $('#common-list-item > .list-item').each((i, item)=> {
            var order = {};
            // 订单头部{订单号,下单时间，订单金额}
            var itemSelector = $(item);
            var header = itemSelector.find('.right-header > div');
            order.id = header.eq(0).html().split('：')[1];
            order.order_create_time = header.eq(1).html().split('：')[1];
            order.actual_total = header.eq(2).html().split('￥')[1];
            // 收货人部分
            var name = itemSelector.find('.subleft-userinfo > .userinfo-cot > div:nth-child(2)').html().split('：')[1];
            order.receiver_name = name.split('\n')[0];
            order.receiver_gender = name.split('\n')[1];
            order.receiver_phone = itemSelector.find('.subleft-userinfo > .userinfo-cot > div:nth-child(3)').html().split('：')[1];
            order.receiver_address = itemSelector.find('.subleft-userinfo > .userinfo-cot > div:nth-child(4)').html().split('\n')[0].split('：')[1];
            order.remark = itemSelector.find('.subleft-userinfo > .info-div-margin').html().split('：')[1];
            // 商品列表部分
            var leftTable = itemSelector.find('.table-menu-info ');
            logger.debug(leftTable.html());
            var products = [];
            leftTable.find('tbody > tr').each((i, tr)=> {
                var product = $(tr).children('td').eq(0).html() + ' x ' + $(tr).children('td').eq(1).html();
                products.push(product);
            });
            order.product_details = products.join(' | ');
            orders.push(order);
        });
        return orders;

}

function postFetch(orders) {
    //return convertToReport(orders).then(convertToCSV);
    logger.debug(_.values(orders));
    return false;
}

function convertToReport(orders) {
    _.each(orders, (order)=> {
        var details = [];
        _.each(order.details, (v)=> {
            details.push(v.food_name + ' * ' + v.count);
        });
        order.product_details = details.join(' | ');
    });
    return promise.resolve(orders);
}
function convertToCSV(orders) {
    var columns = {
        poi_name: '门店',
        wm_order_id_view_str: '订单号',
        order_time_fmt: '下单时间',
        recipient_name: '姓名',
        recipient_phone: '电话',
        recipient_address: '送餐地址',
        product_details: '订购的产品',
        total_before: '订餐金额',
        remark: '备注',
        delivery_btime_fmt: '期望时间'
    };
    var option = {
        header: true,
        columns: columns
    };
    return new promise(function (resolve, reject) {
        stringify(orders, option, function (err, output) {
            if (err) {
                reject(err);
            }
            fs.appendFile('./baidu_' + moment().format('YYYY-MM-DD') + '_' + uuid.v4() + '.csv', output, {
                encoding: 'utf-8',
                flag: 'w+'
            }, function (err) {
                if (err) return reject(err);
                resolve(true);
            });
        });
    });
}