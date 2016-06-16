const nodemailer = require('nodemailer');
const promise = require('bluebird');
const fs = require('fs');
const _ = require('underscore');
const config = require('config');
const logger = require('./logger');
const moment = require('moment');
const smtpConfig = {
    host: config.get('mail.host'),
    port: config.get('mail.port'),
    secure: config.get('mail.secure'), // use SSL
    auth: {
        user: config.get('mail.user'),
        pass: config.get('mail.pass')
    }
};
const transporter = nodemailer.createTransport(smtpConfig);
exports.sendMail = function (beforeDays,files) {
    let beginTime = moment().startOf('day').format('YYYY-MM-DD');
    let endTime = moment().startOf('day').subtract(beforeDays, 'days').format('YYYY-MM-DD');
    let title = '外卖平台_' + beginTime + '_' + endTime + '_报表';
    let mailOptions = {
        from: config.get('mail.from'), // sender address
        to: config.get('mail.mailTo'), // list of receivers
        subject: title, // Subject line
        text: title, // plaintext body
        attachments: _.map(files, function (f) {
            return {
                filename: f,
                content: fs.createReadStream(f)
            };
        })
    };
    return new promise(function (resolve, reject) {
        transporter.sendMail(mailOptions, function (error, info) {
            if (error) {
                return reject(error);
            }
            logger.info('Send mail:' + info.response);
            resolve(info.response);
        });
    });
};
