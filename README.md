# 外卖订单爬虫：美团，饿了么，百度


----------

> 这个程序是用来抓取外卖平台（美团，饿了么，百度）的商户订单开发，并不是一个通用库，而是为这个
特定场景进行开发的。
适用场景：餐饮企业拥有多家外卖门店，订单量非常大，有对订单进行数据分析的需求。
主要功能：每天定时启动，抓取三大外卖平台的订单，转成成excel文件，发邮件给需要的人
### 如何使用
修改config目录下的production.json  

```javascript
{
  "log": {
    "level": "DEBUG"
  },
  "mail": {
    "from": "company@xxx.com", //邮件发送人
    "mailTo": "di.mu@xxx.com", //邮件接收人
    "host":"smtp.xxx.com",
    "port":25,
    "secure":false,
    "user":"company@xxx.com",  //程序使用的邮件
    "pass":"程序使用的邮件的密码"
  },
  "imgCode":{
    "key":"xxxxxxxxxxxxxxxxxxxxxxxxxxxxx"   // https://www.juhe.cn/docs/api/id/60  识别验证码api的key
  },
  "account": [
    {
      "name": "美团xxx店",
      "username": "帐户名",
      "password": "账户密码",
      "type": "meituan"
    },
    {
      "name": "饿了么xxx店",
      "username": "帐户名",
      "password": "账户密码",
      "type": "eleme"
    },
    {
      "name": "百度xxx店",
      "username": "帐户名",
      "password": "账户密码",
      "type": "baidu"
    }
  ]
}
```
其中以下配置是程序中使用验证码识别的api服务， 美团，百度的商家后台都需要验证码登录
api服务使用的是[聚合数据的验证码识别服务](https://www.juhe.cn/docs/api/id/60)，你需要先
申请聚合数据的账号，充值后得到key 填写到如下配置项中去。
```javascript
"imgCode":{
    "key":"xxxxxxxxxxxxxxxxxxxxxxxxxxxxx"   // https://www.juhe.cn/docs/api/id/60  识别验证码api的key
  },
```
邮件功能需要配置详细的smtp服务地址、发件人账号名、密码、端口、是否使用ssl
```
"mail": {
    "from": "company@xxx.com", //邮件发送人
    "mailTo": "di.mu@xxx.com", //邮件接收人
    "host":"smtp.xxx.com",
    "port":25,
    "secure":false,
    "user":"company@xxx.com",  //程序使用的邮件
    "pass":"程序使用的邮件的密码"
  },
```
