function encryptBaiduPwd(input) {
    let output = new Buffer(input);
    let base64 = output.toString('base64');
    let chars = [];
    for(let i=base64.length-2;i>=0;i--){
        chars.push(base64.charAt(i));
    }
    return chars.join('');
}
exports.encryptBaiduPwd = encryptBaiduPwd;