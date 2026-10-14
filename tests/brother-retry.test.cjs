const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../order-service.js'),'utf8');
function service(fetch){const window={KitswAuth:{current:async()=>({emailVerified:true,getIdToken:async()=> 'test'})}};vm.runInNewContext(source,{window,fetch,AbortSignal});return window.OrderService;}
test('Brother preflight failure never creates or sends a print ticket',async()=>{
 let calls=0;const api=service(async url=>{calls++;assert.match(url,/\/health$/);throw Error('offline');});
 await assert.rejects(api.brotherPrint('id',0,'pair',true),e=>e.safeToRetry&&/Cannot reach/.test(e.message));assert.equal(calls,1);
});
test('wrong Brother pairing requests a fresh code without issuing a ticket',async()=>{
 const api=service(async()=>({status:403,ok:false,json:async()=>({})}));
 await assert.rejects(api.brotherPrint('id',0,'pair',true),e=>e.safeToRetry&&e.resetPairing);
});
test('Brother ambiguous submission stays blocked instead of allowing duplicate prints',async()=>{
 let calls=0;const api=service(async url=>{calls++;if(url.endsWith('/health'))return {ok:true,json:async()=>({ready:true,busy:false})};if(url.startsWith('/api'))return {ok:true,json:async()=>({ticket:'test'})};throw Error('disconnected');});
 await assert.rejects(api.brotherPrint('id',0,'pair',true),e=>!e.safeToRetry&&/queue/.test(e.message));assert.equal(calls,3);
});
