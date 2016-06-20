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
const baiduURL = 'http://wmcrm.baidu.com';
const _ = require('underscore');
const FetchTask = require('./fetch_task');
const baiduUri = 'https://wmcrm.baidu.com';
const util = require('./util');
class BaiduFetchTask extends FetchTask {
    constructor(account, option) {
        super(account, option);
        this.columns = {
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
    }

    login() {
        logger.info(`Try to login ${this.account.name}`);
        let getTokenJar = request.jar();
        let getTokenOption = {
            url: 'https://wmpass.baidu.com/wmpass/openservice/captchapair?protocal=https&callback=callbackFromBaidu&_=1466392887410',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/45.0.2454.101 Safari/537.36'
            },
            //proxy: 'http://127.0.0.1:8888',
            jar:getTokenJar,
            strictSSL: false
        };
        return request.getAsync(getTokenOption).then((res)=> {
            let token = null;
            function callbackFromBaidu(result) {
                token = result.data.token;
            }
            eval(res.body);
            return token;
        }).then((token)=> {
            return new promise((resolve,reject)=>{
                let getImgOption = {
                    url: 'https://wmpass.baidu.com/wmpass/openservice/imgcaptcha?token=' + token + '&&color=3c78d8',
                    proxy: 'http://127.0.0.1:8888',
                    jar:getTokenJar,
                    strictSSL: false
                };
                let imgPath = path.resolve(__dirname, '../temp/', uuid.v4() + '.png');
                request.get(getImgOption).on('error',reject).on('end',()=>{resolve({imgPath:imgPath,token:token})})
                .pipe(fs.createWriteStream(imgPath));
            });
        }).then((getImgResult)=> {
            let imgCodeOption = {
                url: 'http://op.juhe.cn/vercode/index',
                formData: {
                    image: fs.createReadStream(getImgResult.imgPath),
                    key: config.get('imgCode.key'),
                    codeType: '1004'
                },
                proxy: 'http://127.0.0.1:8888',
                json: true
            };
            return request.postAsync(imgCodeOption).then((res)=> {
                logger.info(`The img code is ${res.body.result}`);
                getImgResult.imgCode = res.body.result;
                return getImgResult;
            })
        }).then((getImgResult)=>{
            let loginOption = {
                url:'https://wmpass.baidu.com/api/login',
                form: {
                    redirect_url:"http%3A%2F%2Fwmcrm.baidu.com%2F",
                    type:1,
                    channel:'pc',
                    account: this.account.username,
                    upass: util.encryptBaiduPwd(this.account.password),
                    captcha:getImgResult.imgCode,
                    token:getImgResult.token
                },
                proxy: 'http://127.0.0.1:8888',
                strictSSL: false,
                jar:getTokenJar
            };
            return request.postAsync(loginOption).then((res)=> {
                let token = {cookies: getTokenJar.getCookieString(baiduUri)};
                logger.info(`Get ${this.account.name} token ${getTokenJar.getCookieString(baiduUri)}`);
                this.setToken(token);
                return;
            });
        });
    }

    fetchPageAmount() {
        let orderJar = request.jar();
        this.token.cookies.split(';').forEach((v)=> {
            orderJar.setCookie(request.cookie(v), baiduURL);
        });
        var orderParam = {
            qt: 'orderlist',
            order_status: 0,
            start_time: this.option.beginTime.format('YYYY-MM-DD'),
            end_time: this.option.endTime.format('YYYY-MM-DD'),
            pay_type: 2,
            is_asap: 0
        };
        let orderOption = {
            jar: orderJar,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/37.0.2062.94 Safari/537.36',
            }
            //proxy: 'http://127.0.0.1:8888'
        };
        var getOrderURL = 'http://wmcrm.baidu.com/crm?' + qs.stringify(orderParam);
        return request.getAsync(getOrderURL + '&page=1', orderOption).then((res)=> {
            let pageAmount = this.extractPageNumFromHtml(res.body) || 0;
            return pageAmount;
        });
    }

    fetchPage(pageNum) {
        logger.info(`${this.account.name} fetch page ${pageNum}`);
        let orderJar = request.jar();
        this.token.cookies.split(';').forEach((v)=> {
            orderJar.setCookie(request.cookie(v), baiduURL);
        });
        var orderParam = {
            qt: 'orderlist',
            order_status: 0,
            start_time: this.option.beginTime.format('YYYY-MM-DD'),
            end_time: this.option.endTime.format('YYYY-MM-DD'),
            pay_type: 2,
            is_asap: 0
        };
        let orderOption = {
            jar: orderJar,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/37.0.2062.94 Safari/537.36',
            }
            //proxy: 'http://127.0.0.1:8888'
        };
        var getOrderURL = 'http://wmcrm.baidu.com/crm?' + qs.stringify(orderParam);
        return request.getAsync(getOrderURL + '&page=' + pageNum, orderOption).then((res)=> {
            return this.extractOrdersFromHtml(res.body);
        });
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

    extractPageNumFromHtml(html) {
        try {
            let march = /共计---<span>(\d*)<\/span>/m.exec(html);
            let orderAmount = parseInt(march[1]);
            return Math.ceil(orderAmount / 20);
        } catch (e) {
            logger.error('Can not extract page num from baidu page');
            return 0;
        }
    }
}
module.exports = BaiduFetchTask;