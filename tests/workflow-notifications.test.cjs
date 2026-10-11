const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const fs=require('node:fs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('device notifications require opt-in and use the installed service worker',async()=>{
 const dom=new JSDOM('<div class="user-menu"></div>',{url:'https://example.test',runScripts:'outside-only'});const w=dom.window;
 let requested=0,shown=[];
 Object.defineProperty(w,'isSecureContext',{value:true});
 w.Notification={permission:'default',requestPermission:async()=>{requested++;w.Notification.permission='granted';return 'granted';}};
 Object.defineProperty(w.navigator,'serviceWorker',{value:{getRegistration:async()=>({active:true,showNotification:async(...args)=>shown.push(args)})}});
 try{
  w.eval(fs.readFileSync('pwa.js','utf8'));
  await w.AppNotifications.notify('New order','Open the shop','new','operator.html');assert.equal(shown.length,0);assert.equal(requested,0);
  w.document.querySelector('#notification-alerts').click();await tick();assert.equal(requested,1);
  await w.AppNotifications.notify('New order','Open the shop','new','operator.html');assert.equal(shown.length,1);assert.equal(shown[0][1].data.page,'operator.html');
  w.document.querySelector('#notification-alerts').click();await tick();
  await w.AppNotifications.notify('New order','Open the shop','new');assert.equal(shown.length,1);
 }finally{w.close();}
});
test('open-and-print opens only supported formats using authenticated private document fetches',async()=>{
 const dom=new JSDOM('',{url:'https://example.test',runScripts:'outside-only'});const w=dom.window;
 let calls=[],opened=0,revoked=[],objectBlob,printed=0,popup;
 w.AbortSignal={timeout:()=>undefined};w.KitswAuth={current:async()=>({emailVerified:true,getIdToken:async()=> 'test-token'})};
 w.fetch=async(url,options)=>{calls.push({url,options});return{ok:true,blob:async()=>new w.Blob(['file'])};};
 w.URL.createObjectURL=blob=>{objectBlob=blob;return 'blob:private-test';};w.URL.revokeObjectURL=url=>revoked.push(url);
 w.setInterval=()=>0;w.open=()=>{opened++;popup={closed:false,document:{title:'',body:{textContent:''}},location:{replace:url=>{popup.url=url;}},close:()=>{popup.closed=true;}};return popup;};
 try{
  w.eval(fs.readFileSync('order-service.js','utf8'));
  await w.OrderService.openForPrint('order',0,'notes.pdf');assert.equal(opened,1);assert.equal(popup.url,'blob:private-test');assert.equal(objectBlob.type,'application/pdf');assert.equal(popup.opener,null);assert.equal(calls[0].options.headers.Authorization,'Bearer test-token');assert.equal(calls[0].options.cache,'no-store');
  await assert.rejects(w.OrderService.openForPrint('order',0,'notes.docx'),/usual application/);assert.equal(opened,1);
  w.open=()=>null;await assert.rejects(w.OrderService.openForPrint('order',0,'notes.pdf'),/Allow pop-ups/);assert.equal(calls.length,1);
 }finally{w.close();}
});
