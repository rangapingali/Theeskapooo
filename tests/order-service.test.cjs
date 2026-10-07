const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const fs=require('node:fs');
test('checkout API handles cold-start HTML and failed uploads without reporting success',async()=>{
  const dom=new JSDOM('',{url:'https://example.test',runScripts:'outside-only'});
  const w=dom.window;
  w.AbortSignal={timeout:()=>undefined};
  w.KitswAuth={current:async()=>({emailVerified:true,getIdToken:async()=> 'fake-test-token'})};
  w.fetch=async()=>({ok:true,json:async()=>{throw Error('HTML wake-up page');}});
  w.eval(fs.readFileSync('order-service.js','utf8'));
  try {
    assert.equal((await w.OrderService.configuration()).ordersEnabled,false);
    await assert.rejects(w.OrderService.preparePayment({}),/server is starting/);
    w.fetch=async()=>{throw Error('Network failed');};
    await assert.rejects(w.OrderService.upload([{id:'test',file:{name:'test.pdf'},settings:{pages:1}}],'order',()=>{}),/files and settings stay here/);
    w.fetch=async()=>({ok:false,json:async()=>({error:'Shop is paused'})});
    await assert.rejects(w.OrderService.create({}),/Shop is paused/);
    w.fetch=async()=>({ok:true,json:async()=>({pages:1})});
    await assert.rejects(w.OrderService.upload([{id:'test',file:{name:'test.pdf'},settings:{pages:1}}],'order',()=>{}),/Upload was not confirmed/);
  } finally {w.close();}
});
