const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { securityHeaders, sameOrigin, rateLimit, uploadSlots } = require('../server/http-protection.cjs');
function response() { const res = new EventEmitter(); res.headers = {}; res.set = (key, value) => { Object.assign(res.headers, typeof key === 'object' ? key : { [key]: value }); return res; }; res.status = value => { res.code = value; return res; }; res.json = value => { res.body = value; return res; }; return res; }
test('security headers allow app resources without inline scripts and enable HSTS only over HTTPS', () => {
 const res = response(); let calls = 0;
 securityHeaders({secure:true}, res, () => calls++);
 assert.equal(calls,1); assert.equal(res.headers['X-Content-Type-Options'],'nosniff');
 const csp=res.headers['Content-Security-Policy'];
 assert.match(csp,/script-src 'self' https:\/\/www.gstatic.com/);
 assert.doesNotMatch(csp.split('; ').find(s=>s.startsWith('script-src')),/unsafe-inline|unsafe-eval/);
 assert.match(csp,/object-src 'self' blob:/); assert.match(csp,/worker-src 'self'/);
 assert.match(res.headers['Strict-Transport-Security'],/31536000/);
 const local=response(); securityHeaders({secure:false},local,()=>{}); assert.equal(local.headers['Strict-Transport-Security'],undefined);
});
test('cross-origin API requests are blocked; same-origin and signed webhook routing remain available',()=>{
 const run=(headers,path='/orders')=>{const res=response();let accepted=false;sameOrigin({path,get:key=>headers[key]},res,()=>{accepted=true;});return{res,accepted};};
 assert.equal(run({origin:'https://evil.test',host:'app.test'}).res.code,403);
 assert.equal(run({origin:'null',host:'app.test'}).res.code,403);
 assert.equal(run({'sec-fetch-site':'cross-site',host:'app.test'}).res.code,403);
 assert.equal(run({origin:'https://app.test',host:'app.test'}).accepted,true);
 assert.equal(run({host:'app.test'}).accepted,true);
 assert.equal(run({origin:'https://provider.test'},'/payment-webhook').accepted,true);
});
test('request limits reset, report retry time, and cap memory used by IP buckets',()=>{
 let time=0,calls=0;const limit=rateLimit({limit:2,windowMs:1000,maxKeys:1,now:()=>time});
 const send=ip=>{const res=response();limit({ip},res,()=>calls++);return res;};
 send('a');send('a');const blocked=send('a');assert.equal(blocked.code,429);assert.equal(blocked.headers['Retry-After'],'1');
 assert.equal(send('b').code,503);assert.equal(calls,2);time=1000;assert.equal(send('b').code,undefined);assert.equal(calls,3);
});
test('concurrent upload slots release exactly once on completion or disconnection',()=>{
 const slots=uploadSlots(1);let calls=0;const first=response();slots({},first,()=>calls++);
 const blocked=response();slots({},blocked,()=>calls++);assert.equal(blocked.code,429);
 first.emit('finish');first.emit('close');const second=response();slots({},second,()=>calls++);
 const blockedAgain=response();slots({},blockedAgain,()=>calls++);assert.equal(blockedAgain.code,429);assert.equal(calls,2);
 second.emit('close');slots({},response(),()=>calls++);assert.equal(calls,3);
});
