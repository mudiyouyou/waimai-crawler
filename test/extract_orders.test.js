/**
 * Created by Administrator on 2016/6/13.
 */
const expect = require('chai').expect;
const fs = require('fs');
const rewire = require('rewire');
describe('Fetch Baidu order',()=>{
    it('Extract json from html',(done)=>{
        fs.readFile('test/order_from_baidu.html',(err,data)=>{
            let baidu = rewire('../lib/baidu.js');
            let extractOrdersFromHtml = baidu.__get__('extractOrdersFromHtml');
            let orders = extractOrdersFromHtml(data.toString());
            expect(orders).to.be.a('array');
            expect(orders.length > 0 ).to.be.ok;
            done();
        });
    });
});