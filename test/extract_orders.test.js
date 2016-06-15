/**
 * Created by Administrator on 2016/6/13.
 */
const expect = require('chai').expect;
const fs = require('fs');
const rewire = require('rewire');
const BaiduTask = require('../lib/baidu_task');
describe('Fetch Baidu order',()=>{
    it('Extract json from html',(done)=>{
        fs.readFile('test/order_from_baidu.html',(err,data)=>{
            let orders = BaiduTask.prototype.extractOrdersFromHtml(data.toString());
            expect(orders).to.be.a('array');
            expect(orders.length > 0 ).to.be.ok;
            done();
        });
    });
    it('Extract order amount from badidu.html',(done)=>{
        fs.readFile('test/order_from_baidu.html',(err,data)=>{
            let pageNum = BaiduTask.prototype.extractPageNumFromHtml(data.toString());
            expect(pageNum).to.equal(3);
            done();
        });
    });
});