const request = require('request');
const promise = require('bluebird');
const logger = require('./logger');
const qs = require('querystring');
const config = require('config');
const moment = require('moment');
const stringify = require('csv-stringify');
const fs = require('fs');
const path = require('path');
const uuid = require('uuid');
promise.promisifyAll(request);
promise.promisifyAll(fs);
const baiduURL = 'http://wmcrm.baidu.com';
const _ = require('underscore');
const FetchTask = require('./fetch_task');

class BaiduFetchTask extends FetchTask {
    constructor(account) {
        super(account);
    }

    run(beforeDays) {
        let end = moment().startOf('day');
        let begin = moment().startOf('day').subtract(beforeDays, 'days');
        let queryParam = {
            beginTime: begin,
            endTime: end
        };
        this.queryParam = queryParam;
        return this.preFetch().then(this.fetch.bind(this)).then(this.postFetch.bind(this));
    }

    preFetch() {
        logger.info(this.account.name + ' preFetch');
        let cacheFile = path.resolve(__dirname, '../cache.json');
        return fs.readFileAsync(cacheFile).then((data) => {
            let cache = JSON.parse(data.toString());
            let context = cache[this.account.name];
            return context;
        });
    }

    fetch(context) {
        logger.info(this.account.name + ' fetch');
        let orders = [];
        return this.fetchPage(context, 1).then((page)=>{
            orders = orders.concat(page.orders);
            let pageCount = page.pageCount;
            let tasks = [];
            for (let i = 2; i <= pageCount; i++) {
                tasks.push(this.fetchPage(context, i));
            }
            return promise.all(tasks).then( (pages)=>{
                pages.forEach( (page)=>{
                    orders = orders.concat(page.orders);
                });
                return orders;
            });
        });
    }

    fetchPage(context, pageNum) {
        let orderJar = request.jar();
        context.cookies.split(';').forEach((v)=> {
            orderJar.setCookie(request.cookie(v), baiduURL);
        });
        var orderParam = {
            qt: 'orderlist',
            order_status: 9,
            start_time: this.queryParam.beginTime.format('YYYY-MM-DD'),
            end_time: this.queryParam.endTime.format('YYYY-MM-DD'),
            pay_type: 2,
            is_asap: 0
        };
        let orderOption = {
            jar: orderJar,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/37.0.2062.94 Safari/537.36',
            },
            //proxy: 'http://127.0.0.1:8888'
        };
        var getOrderURL = 'http://wmcrm.baidu.com/crm?' + qs.stringify(orderParam);
        return request.getAsync(getOrderURL + '&page=' + pageNum, orderOption).then((res)=> {
            let pageCount = 0;
            if(pageNum==1){
                pageCount = this.extractPageNumFromHtml(res.body);
            }
            return {orders: this.extractOrdersFromHtml(res.body), pageCount: pageCount};
        });
    }

    postFetch(orders) {
        logger.info(this.account.name + ' postFetch');
        let columns = {
            order_id: '订单号',
            paid_time_str: '下单时间',
            user_real_name: '姓名',
            user_phone: '电话',
            user_address: '送餐地址',
            product_details: '订购的产品',
            distance: '距离',
            user_note: '备注',
            order_price: '原价',
            send_price: '配送费',
            discount_price_total: '折扣成本',
            total_price: '实际收入'
        };
        var toConvertToCSV = _.partial(super.convertToCSV,columns);
        return this.convertToReport(orders).then(toConvertToCSV.bind(this));
    }

    convertToReport(orders) {
        _.each(orders, (order)=> {
            let details = [];
            let products = order.content.products;
            _.each(products, (v)=> {
                details.push(v.name + ' * ' + v.number);
            });
            order.order_id = order.order_id + '_';
            order.product_details = details.join(' | ');
            order.paid_time_str = moment.unix(order.paid_time).format('YYYY/MM/DD HH:mm');
            order.discount_price_total = order.content.discount_display.subsidy_total;
            order.send_price = order.content.send_price;
        });
        return promise.resolve(orders);
    }

    extractOrdersFromHtml(html) {
        try {
            let lastPart = html.split("require('wand:widget/order/list/list.js').createWidget(")[1];
            let jsonStr = lastPart.split(");")[0];
            let json = JSON.parse(jsonStr);
            let orders = json.content.order_list;
            return orders;
        } catch (e) {
            logger.error('Can not extract orders from baidu page');
            return [];
        }
    }
    extractPageNumFromHtml(html){
        try{
            let march = /共计---<span>(\d*)<\/span>/m.exec(html);
            let orderAmount = parseInt(march[1]);
            return Math.ceil(orderAmount/20);
        } catch (e) {
            logger.error('Can not extract page num from baidu page');
            return 0;
        }
    }
}
module.exports = BaiduFetchTask;