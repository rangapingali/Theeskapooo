const {test}=require('node:test'),assert=require('node:assert/strict');
const {PDFDocument,degrees,PDFName}=require('pdf-lib');
const {Readable}=require('node:stream');
const {layout,selected}=require('../bridge/layout.cjs');
const {createAgent,settings}=require('../bridge/agent.cjs');
const bridge=require('../server/brother-bridge.cjs');
const defaults=require('../print-core.js').defaults;
test('tall/wide image previews stay on one A4 page without text headers or cropping',async()=>{
 const sharp=require('sharp');
 for(const [width,height,orientation]of [[100,1000,'portrait'],[1000,100,'landscape']]){
  const image=await sharp({create:{width,height,channels:3,background:'green'}}).png().toBuffer();
  const pdf=await PDFDocument.load(await require('../server/print-image.cjs').imagePdf(image,orientation));
  assert.equal(pdf.getPageCount(),1);const page=pdf.getPage(0);
  assert.equal(page.getWidth()>page.getHeight(),orientation==='landscape');
  const pngJob=await PDFDocument.load(await layout(image,'image.png',{...defaults,copies:5,layout:4}));
  assert.equal(pngJob.getPageCount(),2,'five PNG copies at four per side use two pages');
 }
});
async function sample(){const pdf=await PDFDocument.create();for(let i=0;i<5;i++){const p=pdf.addPage([300,400]);p.drawText('PAGE '+(i+1),{x:30,y:300});if(i===1)p.setRotation(degrees(90));}return pdf.save();}
test('layout applies ranges, n-up, copies, A4 landscape and duplex copy boundaries',async()=>{
 const bytes=await sample();assert.deepEqual(selected('3,1-2,2',5),[0,1,2]);
 const s={...defaults,pages:5,copies:2,range:'1-3',sides:'double'};
 const result=await PDFDocument.load(await layout(bytes,'test.pdf',s));
 assert.equal(result.getPageCount(),7);assert.equal(result.getPage(3).node.has(PDFName.of('Contents')),false);
 const nup=await PDFDocument.load(await layout(bytes,'test.pdf',{...s,layout:2,orientation:'landscape'}));assert.equal(nup.getPageCount(),4);assert.ok(nup.getPage(0).getWidth()>nup.getPage(0).getHeight());
 await assert.rejects(layout(bytes,'test.pdf',{...s,colour:'colour'}),/Unsupported/);
 await assert.rejects(layout(bytes,'test.pdf',{...s,pages:3}),/count changed/);
 const forms=await PDFDocument.load(bytes);forms.getForm().createTextField('name').addToPage(forms.getPage(0));
 await assert.rejects(layout(await forms.save(),'test.pdf',s),/flatten/i);
});
test('tickets enforce operator, payment, own-order and offline checks and cannot be redeemed twice',async()=>{
 const records=new Map(),id='11111111-1111-1111-1111-111111111111';
 const db={collection:c=>({doc:id=>({key:c+'/'+id})}),runTransaction:async fn=>fn({get:async ref=>({data:()=>structuredClone(records.get(ref.key))}),set:(ref,data)=>records.set(ref.key,data),update:(ref,data)=>records.set(ref.key,{...records.get(ref.key),...data})})};
 const bytes=await sample();const order={uid:'student',status:'accepted',paymentStatus:'paid',paymentPreference:'online',files:[{name:'notes.pdf',path:'private',settings:{...defaults,pages:5}}]};records.set('orders/'+id,order);
 const api=bridge({db,bucket:{file:()=>({createReadStream:()=>Readable.from([bytes])})},paymentConfig:{ordersCollection:'orders'},env:{BROTHER_TEST_BRIDGE:'true',PRINT_OPERATOR_EMAILS:'shop@kitsw.ac.in'}});
 const req={params:{id,index:'0'},body:{},student:{uid:'operator',email:'shop@kitsw.ac.in',email_verified:true}};let issued;
 await assert.rejects(api.issue({...req,student:{...req.student,email:'student@kitsw.ac.in'}},{json:()=>{}}),/Operator/);
 await assert.rejects(api.issue({...req,student:{...req.student,uid:'student'}},{json:()=>{}}),/Another operator/);
 order.paymentPreference='offline';await assert.rejects(api.issue(req,{json:()=>{}}),/student is present/);req.body.studentPresent=true;
 await api.issue(req,{json:value=>issued=value});assert.equal(issued.ticket.length,64);
 const oldTicket=issued.ticket; await api.issue(req,{json:value=>issued=value});
 await assert.rejects(api.redeem({body:{id,index:0},get:()=> 'Bearer '+oldTicket},{json:()=>{}}),/already used/);
 let payload;const redemption={body:{id,index:0},get:()=> 'Bearer '+issued.ticket};
 await api.redeem(redemption,{json:value=>payload=value});await assert.rejects(api.issue(req,{json:()=>{}}),/already has/);assert.equal(payload.settings.pages,5);assert.equal(Buffer.from(payload.bytes,'base64').length,bytes.length);
 await assert.rejects(api.redeem(redemption,{json:()=>{}}),/already used/);
 await assert.rejects(api.recover(req,{json:()=>{}}),/Confirm/);
 const recovery={...req,body:{queueEmpty:true,nothingPrinted:true,helperRestarted:true}};
 await assert.rejects(api.recover({...recovery,student:{...req.student,email:'student@kitsw.ac.in'}},{json:()=>{}}),/Operator/);
 await assert.rejects(api.recover(recovery,{json:()=>{}}),/five minutes/);
 records.get('brotherTestJobs/'+id+'-0').claimedMs=Date.now()-310000;
 await api.recover(recovery,{json:()=>{}});
 assert.equal(records.get('brotherTestJobs/'+id+'-0').state,'released');
 await assert.rejects(api.redeem(redemption,{json:()=>{}}),/already used/);
 await api.issue(req,{json:value=>issued=value});
 assert.equal(records.get('brotherTestJobs/'+id+'-0').state,'issued');

});
test('loopback agent rejects unpaired origins/keys and invokes printing with trusted settings only',async()=>{
 let prints=0;const bytes=await sample(),origin='https://test.example';
 const server=createAgent({origin,pairing:'test-pair',redeem:async()=>({name:'notes.pdf',settings:{...defaults,pages:5},bytes:Buffer.from(bytes).toString('base64')}),print:async(file,options)=>{prints++;assert.match(file,/print.pdf$/);assert.equal(options,'paper=A4,monochrome,1x,fit,simplex');}});
 server.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const url='http://127.0.0.1:'+server.address().port+'/print';
 const post=(site,key)=>fetch(url,{method:'POST',headers:{Host:'127.0.0.1:4179',Origin:site,'X-Bridge-Key':key,'Content-Type':'application/json'},body:JSON.stringify({id:'11111111-1111-1111-1111-111111111111',index:0,ticket:'a'.repeat(64)})});
 try{const health=await fetch(url.replace('/print','/health'),{method:'POST',headers:{Origin:origin,'X-Bridge-Key':'test-pair'}});assert.deepEqual(await health.json(),{ready:true,busy:false});assert.equal(prints,0);assert.equal((await post('https://evil.example','test-pair')).status,403);assert.equal((await post(origin,'bad')).status,403);assert.equal((await post(origin,'test-pair')).status,200);assert.equal(prints,1);assert.match(settings({...defaults,sides:'double'}),/duplexlong/);}finally{await new Promise(r=>server.close(r));}
});
