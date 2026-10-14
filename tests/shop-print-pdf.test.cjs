const {test}=require('node:test');
const assert=require('node:assert/strict');
const {PDFDocument,PDFName,degrees}=require('pdf-lib');
const {prepare,selected,sidePlan}=require('../server/shop-print-pdf.cjs');
const {defaults,estimate}=require('../print-core.js');
const express=require('express');
const {Readable}=require('node:stream');
async function sample(){const pdf=await PDFDocument.create();for(let i=0;i<5;i++){const page=pdf.addPage([300,500]);page.drawText('PAGE '+(i+1),{x:30,y:200});if(i===1)page.setRotation(degrees(90));}return Buffer.from(await pdf.save());}

test('prepared PDFs apply ranges, copies, layouts and sheet boundaries without changing prices',async()=>{
 const bytes=await sample();assert.deepEqual(selected('3,1-2,2',5),[0,1,2]);
 const s={...defaults,pages:5,range:'1-3',copies:2,sides:'double'};
 const pdf=await PDFDocument.load(await prepare(bytes,'notes.pdf',s));
 assert.equal(pdf.getPageCount(),7);assert.equal(pdf.getPage(3).node.has(PDFName.of('Contents')),false);
 assert.equal(estimate(s).printedSides,6);assert.equal(estimate(s).sheets,4);
 const landscape=await PDFDocument.load(await prepare(bytes,'notes.pdf',{...s,layout:2,orientation:'landscape',colour:'colour'}));
 assert.equal(landscape.getPageCount(),4);assert.ok(landscape.getPage(0).getWidth()>landscape.getPage(0).getHeight());
 assert.deepEqual(sidePlan(3,2,true,false),[0,1,0,1,2,null,2]);
 assert.deepEqual(sidePlan(3,2,false,false),[0,0,1,1,2,2]);
 await assert.rejects(prepare(bytes,'notes.pdf',{...s,pages:4}),/count changed/);
 await assert.rejects(prepare(bytes,'notes.pdf',{...s,copies:500,range:''}),/limit/);
 const form=await PDFDocument.load(bytes);form.getForm().createTextField('name').addToPage(form.getPage(0));
 await assert.rejects(prepare(Buffer.from(await form.save()),'notes.pdf',s),/flatten/);
 assert.throws(()=>estimate({...defaults,collate:'invalid'}),/copy order/);
 assert.throws(()=>estimate({...defaults,duplexEdge:'invalid'}),/binding edge/);
 const blank=await PDFDocument.create();blank.addPage();
 assert.equal((await PDFDocument.load(await prepare(Buffer.from(await blank.save()),'blank.pdf',defaults))).getPageCount(),1);
});

test('PNG copies are packed exactly as priced, within a single A4 sheet for four-up',async()=>{
 const image=await require('sharp')({create:{width:50,height:1000,channels:3,background:'red'}}).png().toBuffer();
 const s={...defaults,copies:4,layout:4};
 const pdf=await PDFDocument.load(await prepare(image,'tall.png',s));assert.equal(pdf.getPageCount(),1);
 assert.equal(estimate(s,{image:true}).printedSides,1);assert.equal(pdf.getPage(0).getWidth(),595.28);
});

test('prepared-file API protects unpaid, own, offline, collected and cancelled orders',async()=>{
 const bytes=await sample(), id='11111111-1111-1111-1111-111111111111';
 const order={uid:'student',status:'accepted',paymentStatus:'paid',paymentPreference:'online',files:[{name:'test.pdf',path:'private',settings:{...defaults,pages:5}}]};
 let reads=0;
 const db={collection:()=>({doc:()=>({get:async()=>({exists:true,data:()=>order})})})};
 const app=express();app.use((req,res,next)=>{req.student={uid:req.get('x-user')||'operator',email:(req.get('x-user')||'operator')+'@kitsw.ac.in',email_verified:true};next();});
 require('../server/manual-routes.cjs')(app,{db,bucket:{file:()=>({createReadStream:()=>{reads++;return Readable.from([bytes]);}})},paymentConfig:{ordersCollection:'orders'},env:{PRINT_OPERATOR_EMAILS:'operator@kitsw.ac.in'},FieldValue:{},publicOrder:s=>s});
 app.use((error,req,res,next)=>res.status(error.httpStatus||500).json({error:error.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const get=(user='operator')=>fetch('http://127.0.0.1:'+server.address().port+'/api/operator/orders/'+id+'/files/0?prepared=1',{headers:{'x-user':user}});
 try{
  assert.equal((await get('student')).status,403);
  order.paymentStatus='unpaid';assert.equal((await get()).status,409);order.paymentStatus='paid';
  order.uid='operator';assert.equal((await get()).status,403);order.uid='student';
  order.paymentPreference='offline';assert.equal((await get()).status,409);order.status='printing';
  const response=await get();assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/application\/pdf/);
  assert.equal((await PDFDocument.load(await response.arrayBuffer())).getPageCount(),5);assert.equal(reads,1);
  order.status='cancelled';assert.equal((await get()).status,409);order.status='collected';assert.equal((await get()).status,410);assert.equal(reads,1);
 }finally{await new Promise(r=>server.close(r));}
});
