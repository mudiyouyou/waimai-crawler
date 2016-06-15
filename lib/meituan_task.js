const request = require('request');
const promise = require('bluebird');
const logger = require('./logger');
const qs = require('querystring');
const config = require('config');
const moment = require('moment');
const fs = require('fs');
const path = require('path');
const uuid = require('uuid');
promise.promisifyAll(request);
promise.promisifyAll(fs);
const _ = require('underscore');
const meituanUri = 'https://waimaie.meituan.com';
const geolib = require('geolib');
const FetchTask = require('./fetch_task');
class MeituanTask extends FetchTask {

    constructor(account) {
        super(account);
    }

    run(beforeDays) {
        let yesterday = moment().startOf('day').subtract(beforeDays, 'days');
        let queryParam = {
            beginTime: yesterday,
            endTime: yesterday
        };
        this.queryParam = queryParam;
        return this.preFetch().then(this.fetch.bind(this)).then(this.postFetch.bind(this));
    }

    fetch(context) {
        let orders = [];
        return this.fetchPage(context).then((page) => {
            orders = orders.concat(page.orders);
            let pageCount = page.pageCount;
            let tasks = [];
            for (let i = 2; i <= pageCount; i++) {
                tasks.push(this.fetchPage(context, i));
            }
            return promise.all(tasks).then((pages)=> {
                pages.forEach((page)=> {
                    orders = orders.concat(page.orders);
                });
                return orders;
            });
        });
    }

    preFetch() {
        let cacheFile = path.resolve(__dirname, '../cache.json');
        return fs.readFileAsync(cacheFile).then((data) => {
            let cache = JSON.parse(data.toString());
            let context = cache[this.account.name];
            if (!context) {
                return this.login().then((loginRes)=>{
                    //logger.debug(loginRes);
                    context = loginRes;
                    cache[this.account.name] = context;
                    fs.writeFile(cacheFile, JSON.stringify(cache));
                    return context;
                });
            } else {
                return context;
            }
        });
    }

    login() {
        let logonJar = request.jar();
        let logonOption = {
            headers: {
                'User-Agent': 'MeituanWaimai/3.0.1.0/32 Windows/6.1 Id/{5B0BFF35-BAF5-4403-A92B-C47497952E87}',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
            },
            //proxy: 'http://127.0.0.1:8888',
            strictSSL: false,
            jar: logonJar
        };
        return request.getAsync('https://waimaie.meituan.com/logon', logonOption).then((res)=> {
            let logonCookies = logonJar.getCookieString(meituanUri);
            //logger.debug(logonCookies);
            let loginJar = request.jar();
            logonCookies.split(';').forEach((v)=> {
                loginJar.setCookie(request.cookie(v), meituanUri);
            });
            let loginOption = {
                form: {
                    userName: this.account.username,
                    password: this.account.password,
                    imgVerifyValue: null
                },
                headers: {
                    'User-Agent': 'MeituanWaimai/3.0.1.0/32 Windows/6.1 Id/{5B0BFF35-BAF5-4403-A92B-C47497952E87}',
                    'Accept': '*/*',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Referer': 'https://waimaie.meituan.com/logon',
                    'Origin': 'https://waimaie.meituan.com',
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
                },
                //proxy: 'http://127.0.0.1:8888',
                strictSSL: false,
                jar: loginJar
            };
            return request.postAsync('https://waimaie.meituan.com/v2/logon/pass/step1/logon', loginOption).then((res)=> {
                return {cookies: loginJar.getCookieString(meituanUri)};
            });
        });
    }

    fetchPage(context, pageNum = 1) {
        let orderJar = request.jar();
        context.cookies.split(';').forEach((v)=> {
            orderJar.setCookie(request.cookie(v), meituanUri);
        });
        let orderOption = {
            jar: orderJar,
            headers: {
                'User-Agent': 'MeituanWaimai/3.0.1.0/32 Windows/6.1 Id/{5B0BFF35-BAF5-4403-A92B-C47497952E87}'
            },
            //proxy: 'http://127.0.0.1:8888',
            strictSSL: false,
            json: true
        };
        let orderParam = {
            wmOrderPayType: -2,
            wmOrderStatus: -1,
            sortField: 1,
            startDate: this.queryParam.beginTime.format('YYYY-MM-DD'),
            endDate: this.queryParam.endTime.format('YYYY-MM-DD')
        };
        let getOrderURL = 'https://waimaie.meituan.com/v2/order/history/r/query?' + qs.stringify(orderParam);
        return request.getAsync(getOrderURL + '&pageNum=' + pageNum, orderOption).then((res)=>{
            let orders = [],pageCount = 0;
            if(res.body.wmOrderList){
                orders = res.body.wmOrderList;
            }
            if(res.body.pageCount){
                pageCount = res.body.pageCount;
            }
            return {orders: orders, pageCount: pageCount};
        });
    }

    postFetch(orders) {
        let columns = {
            wm_order_id_view_str: '订单号',
            order_time_fmt: '下单时间',
            recipient_name: '姓名',
            recipient_phone: '电话',
            recipient_address: '送餐地址',
            product_details: '订购的产品',
            distance: '距离',
            remark: '备注',
            total_before: '原价',
            shipping_fee: '配送费',
            discount_total: '折扣成本',
            total_after: '实际收入'
        };
        let toConvertToCSV = _.partial(super.convertToCSV, columns);
        return this.convertToReport(orders).then(toConvertToCSV.bind(this));
    }


    convertToReport(orders) {
        _.each(orders, (order)=> {

            let details = [];
            _.each(order.details, (v)=> {
                details.push(v.food_name + ' * ' + v.count);
            });
            let discount = _.reduce(order.discounts, (total, discount)=>{
                var count = discount.info == "" ? 0 : Math.abs(Number.parseFloat(discount.info));
                return total + count;
            }, 0);
            order.wm_order_id_view_str = order.wm_order_id_view_str + '_';
            order.discount_total = discount;
            order.product_details = details.join(' | ');
            let distance = geolib.getDistance({
                latitude: order.address_latitude / 1000000,
                longitude: order.address_longitude / 1000000
            }, {latitude: order.poi_latitude / 1000000, longitude: order.poi_longitude / 1000000});
            order.distance = distance / 1000 + 'km'
        });
        return promise.resolve(orders);
    }
}
module.exports = MeituanTask;