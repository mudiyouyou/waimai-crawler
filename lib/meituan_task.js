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

    constructor(account, option) {
        super(account, option);
        this.columns = {
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
    }

    login() {
        logger.info(`Try to login ${this.account.name}`);
        function logon() {
            let logonJar = request.jar();
            let logonOption = {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/45.0.2454.101 Safari/537.36',
                    Cookie: 'wpush_server_url=wss://wpush.meituan.com; shopCategory=food'
                },
                //proxy: 'http://127.0.0.1:8888',
                strictSSL: false,
                jar: logonJar
            };
            return request.getAsync('https://waimaie.meituan.com/logon', logonOption).then((res)=> {
                return logonJar.getCookieString(meituanUri);
            });
        }

        function getDeviceUUID(logonCookies) {
            //logger.debug('logonCookies:' + logonCookies);
            let deviceJar = request.jar();
            logonCookies.split(';').forEach((v)=> {
                deviceJar.setCookie(request.cookie(v), meituanUri);
            });
            let getDeviceOption = {
                url: 'https://waimaie.meituan.com/api/poi/r/deviceUuid',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/45.0.2454.101 Safari/537.36'
                },
                //proxy: 'http://127.0.0.1:8888',
                //jar: deviceJar,
                strictSSL: false,
                json: true
            };
            return request.postAsync(getDeviceOption).then((res)=> {
                //logger.debug(res.body);
                deviceJar.setCookie(request.cookie('device_uuid=' + res.body.data), meituanUri);
                return deviceJar.getCookieString(meituanUri);
            });
        }

        function getImgCode(logonCookies) {
            logger.info('Login All cookies:' + logonCookies);
            let imgCodeJar = request.jar();
            logonCookies.split(';').forEach((v)=> {
                imgCodeJar.setCookie(request.cookie(v), meituanUri);
            });
            return new promise((resolve, reject)=> {
                let getImgOption = {
                    url: 'https://waimaie.meituan.com/v2/logon/pass/refreshImg?time=' + new Date().getTime(),
                    //proxy: 'http://127.0.0.1:8888',
                    jar: imgCodeJar,
                    strictSSL: false
                };
                let imgPath = path.resolve(__dirname, '../temp/', uuid.v4() + '.png');
                request.get(getImgOption).on('error', reject).on('end', ()=> {
                    //logger.debug('美团 imgcode page:' + imgPath);
                    resolve(imgPath)
                }).pipe(fs.createWriteStream(imgPath));
            }).then((imgPath)=> {
                    let imgCodeOption = {
                        url: 'http://op.juhe.cn/vercode/index',
                        formData: {
                            image: fs.createReadStream(imgPath),
                            key: config.get('imgCode.key'),
                            codeType: '1004'
                        },
                        timeout: 100000,
                        //proxy: 'http://127.0.0.1:8888',
                        json: true
                    };
                    return request.postAsync(imgCodeOption).then((res)=> {
                        logger.info(`Image to string result: ${JSON.stringify(res.body)}`);
                        let imgCode = res.body.result;
                        return {cookies: logonCookies, imgCode: imgCode};
                    });
                });
        }

        function doLogin(result) {
            logger.info('Login input data: ' + JSON.stringify(result));
            let loginJar = request.jar();
            result.cookies.split(';').forEach((v)=> {
                loginJar.setCookie(request.cookie(v), meituanUri);
            });
            let loginOption = {
                url: 'https://waimaie.meituan.com/v2/logon/pass/step1/logon',
                form: {
                    userName: this.account.username,
                    password: this.account.password,
                    imgVerifyValue: result.imgCode
                },
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/45.0.2454.101 Safari/537.36'
                },
                //proxy: 'http://127.0.0.1:8888',
                strictSSL: false,
                jar: loginJar
            };
            return request.postAsync(loginOption).then((res)=> {
                let token = {cookies: loginJar.getCookieString(meituanUri)};
                this.setToken(token);
                return;
            });
        }

        return logon().then(getImgCode).then(doLogin.bind(this));
    }

    fetchPageAmount() {
        //logger.debug("fetchPageAmount start.");
        let orderJar = request.jar();
        this.token.cookies.split(';').forEach((v)=> {
            orderJar.setCookie(request.cookie(v), meituanUri);
        });
        let orderOption = {
            jar: orderJar,
            headers: {
                'User-Agent': 'MeituanWaimai/3.0.1.0/32 Windows/6.1 Id/{5B0BFF35-BAF5-4403-A92B-C47497952E87}'
            },
            strictSSL: false,
            json: true,
            timeout: 2000
        };
        let orderParam = {
            getNewVo: 1,
            wmOrderPayType: -2,
            wmOrderStatus: -1,
            sortField: 1,
            startDate: this.option.beginTime.format('YYYY-MM-DD'),
            endDate: this.option.endTime.format('YYYY-MM-DD'),
            lastLabel: '',
            nextLabel: ''
        };

        let getOrderURL = 'https://waimaie.meituan.com/v2/order/history/r/query?' + qs.stringify(orderParam);
        //logger.debug('fetchPageAmount request:' + JSON.stringify(getOrderURL));
        return request.getAsync(getOrderURL, orderOption).then((res)=> {
            logger.debug("fetchPageAmount response:" + JSON.stringify(res.body));
            if (!res.body.nextLabel) return promise.reject(new Error('Not found pageAmount'));
            return res.body.nextLabel.day_seq;
        });
    }

    fetchPages(secondNum) {
        //logger.debug("fetchPages start. second num:" + secondNum);
        let tasks = [];
        tasks.push(this.fetchPage(0));
        while (secondNum > 1) {
            tasks.push(this.fetchPage(secondNum));
            secondNum = secondNum - 10;
        }
        return promise.all(tasks).then((result)=> {
            //logger.debug("fetchPages end.");
            return _.flatten(result);
        });
    }

    fetchPage(daySeq) {
        //logger.debug("fetchPage start.day seq:" + daySeq);
        let nextLabel = "";
        if (daySeq != 0) {
            nextLabel = {
                "day": this.option.beginTime.format('YYYYMMDD'),
                "page": 0,
                "setPage": false,
                "setDay": true,
                "day_seq": daySeq,
                "setDay_seq": true
            };
            nextLabel = JSON.stringify(nextLabel);
        }
        let orderJar = request.jar();
        this.token.cookies.split(';').forEach((v)=> {
            orderJar.setCookie(request.cookie(v), meituanUri);
        });
        let orderOption = {
            jar: orderJar,
            headers: {
                'User-Agent': 'MeituanWaimai/3.0.1.0/32 Windows/6.1 Id/{5B0BFF35-BAF5-4403-A92B-C47497952E87}'
            },
            strictSSL: false,
            json: true,
            timeout: 2000
        };
        let orderParam = {
            getNewVo: 1,
            wmOrderPayType: 2,
            wmOrderStatus: -2,
            sortField: 1,
            startDate: this.option.beginTime.format('YYYY-MM-DD'),
            endDate: this.option.endTime.format('YYYY-MM-DD'),
            lastLabel: '',
            nextLabel: nextLabel
        };
        let getOrderURL = 'https://waimaie.meituan.com/v2/order/history/r/query?' + qs.stringify(orderParam);
        //logger.debug(getOrderURL);
        return request.getAsync(getOrderURL, orderOption).then((res)=> {
            //logger.debug("fetchPage end.");
            //logger.debug(JSON.stringify(res.body));
            return res.body.wmOrderList || [];
        });
    }

    convertToReport(orders) {
        //logger.debug("convertToReport start");
        _.each(orders, (order)=> {
            let details = [];
            _.each(order.cartDetailVos, (cartDetail)=> {
                _.each(cartDetail.details,(v)=>{
                    details.push(v.food_name + ' * ' + v.count);
                });
            });
            let discount = _.reduce(order.discounts, (total, discount)=> {
                discount.info = discount.info.replace(/[^0-9 .]/g, '');
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
        //logger.debug("convertToReport end");
        return promise.resolve(orders);
    }
}

module.exports = MeituanTask;