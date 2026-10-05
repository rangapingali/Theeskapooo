const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const fs=require('node:fs');
test('alerts sound once for ready and confirmed-paid transitions, never for pending claims or initial history',async()=>{
 const dom=new JSDOM('<button id="sound-alerts"></button><div id="order-alert" hidden></div>',{url:'http://localhost',runScripts:'outside-only'});
 let sounds=0;
 dom.window.Audio=class{async play(){sounds++;}};
 dom.window.eval(fs.readFileSync('order-alerts.js','utf8'));
 try{
  const a=dom.window.OrderAlerts;a.setup('/notification-voice.mp3');dom.window.document.querySelector('button').click();await Promise.resolve();sounds=0;
  a.observe('student',[{id:'1',status:'accepted',paymentStatus:'unpaid'}]);assert.equal(sounds,0);
  a.observe('student',[{id:'1',status:'printing',paymentStatus:'pending_verification'}]);assert.equal(sounds,0);
  a.observe('student',[{id:'1',status:'ready',paymentStatus:'pending_verification'}]);assert.equal(sounds,1);
  a.observe('student',[{id:'1',status:'ready',paymentStatus:'pending_verification'}]);assert.equal(sounds,1);
  a.observe('student',[{id:'1',status:'ready',paymentStatus:'paid'}]);assert.equal(sounds,2);
  a.observe('another',[{id:'1',status:'ready',paymentStatus:'paid'}]);assert.equal(sounds,2);
 }finally{dom.window.close();}
});
