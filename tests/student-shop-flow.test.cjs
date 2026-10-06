const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Readable } = require('node:stream');
const express = require('express');
const { PDFDocument } = require('pdf-lib');
function database() {
  let records = new Map(), queue = Promise.resolve();
  const snap = (id, data) => ({ id, exists: data != null, data: () => structuredClone(data) });
  const collection = (path, owner) => ({
    doc(id = randomUUID()) { const ref = { id, path: path+'/'+id, collection: n => collection(path+'/'+id+'/'+n), get: async () => snap(id, records.get(ref.path)) }; return ref; },
    where: (field, op, uid) => collection(path, uid), orderBy() { return this; }, limit() { return this; },
    async get() { return { docs: [...records].filter(([p,v]) => p.startsWith(path+'/') && p.split('/').length===path.split('/').length+1 && (!owner || v.uid===owner)).map(([p,v]) => snap(p.split('/').pop(),v)) }; }
  });
  return { collection, runTransaction(fn) {
    const run = queue.then(async () => {
      const copy = structuredClone(records);
      await fn({ get: async r => snap(r.id, copy.get(r.path)), set: (r,v) => copy.set(r.path,v), create: (r,v) => { assert.equal(copy.has(r.path),false);copy.set(r.path,v); }, update: (r,v) => { assert.ok(copy.has(r.path));copy.set(r.path,{...copy.get(r.path),...v}); } }); records=copy;
    }); queue=run.catch(()=>{});return run;
  } };
}

test('declaration checkout: private draft, explicit confirmation, immutable total, idempotent order, no recipient approval', async () => {
  const db=database(), app=express(); app.use(express.json());
  app.use((req,res,next)=>{const uid=req.get('x-user')||'student';req.student={uid,email:uid+'@kitsw.ac.in',email_verified:true};next();});
  const deps={db,bucket:{file:()=>({getMetadata:async()=>[{size:100,contentType:'application/octet-stream',generation:'1'}]})},paymentConfig:{mode:'self_declared',enabled:true,ordersCollection:'orders',quotaCollection:'quotas'},publicOrder:s=>({id:s.id,...s.data()}),FieldValue:{serverTimestamp:()=>Date.now()},env:{PRINT_OPERATOR_EMAILS:'shop@kitsw.ac.in',MERCHANT_UPI_REFERENCE:'test@bank',MERCHANT_UPI_ACCOUNT_NAME:'Test'}};
  for(const route of ['payment-drafts','order-routes','manual-routes']) require('../server/'+route+'.cjs')(app,deps);
  app.use((e,req,res,next)=>res.status(e.httpStatus||500).json({error:e.message}));
  const server=app.listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+server.address().port+'/api';
  const post=async(path,body,user='student')=>{const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','X-User':user},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
  async function input() {
    const id=randomUUID(), path='student-uploads/student/'+id+'/'+randomUUID()+'.pdf';
    await db.runTransaction(async tx=>tx.create(db.collection('uploadSessions').doc(id),{uid:'student',state:'open',createdMs:Date.now(),files:{one:{path,size:100,pages:3}}}));
    return {id,shop:'campus',notes:'',pickupTime:null,paymentPreference:'online',priority:true,files:[{path,size:100,name:'notes.pdf',settings:{...require('../print-core.js').defaults,pages:3}}]};
  }
  try {
    const a=await input();
    assert.equal((await post('/orders',a)).status,400);
    assert.equal((await post('/orders',{...a,paymentDeclared:true})).status,409);
    const draft=await post('/payment-drafts',a); assert.equal(draft.status,200); assert.equal(draft.data.amountPaise,2300); assert.equal(draft.data.verifiedByBank,false);
    assert.equal((await db.collection('orders').get()).docs.length,0);
    assert.equal((await post('/orders',{...a,paymentDeclared:'true'})).status,400);
    assert.equal((await post('/orders',{...a,priority:false,paymentDeclared:true})).status,409);
    assert.notEqual((await post('/orders',{...a,paymentDeclared:true},'other')).status,201);
    const committed=await Promise.all([post('/orders',{...a,paymentDeclared:true}),post('/orders',{...a,paymentDeclared:true})]);
    committed.forEach(r=>{assert.ok([200,201].includes(r.status),JSON.stringify(r));assert.equal(r.data.order.paymentStatus,'declared_paid');assert.equal(r.data.order.quoteAmountPaise,2300);});
    assert.deepEqual(committed[0].data.order.collectionSlot,committed[1].data.order.collectionSlot);
    assert.equal((await db.collection('orders').get()).docs.length,1);
    assert.equal((await post('/operator/orders/'+a.id+'/payment-review',{},'shop')).status,409);
    for(const status of ['printing','ready','collected']) assert.equal((await post('/operator/orders/'+a.id+'/status',{status},'shop')).status,200);
    const b=await input(); await post('/payment-drafts',b);
    const second=await post('/orders',{...b,paymentDeclared:true}); assert.equal(second.status,201);
    assert.notDeepEqual(second.data.order.collectionSlot,committed[0].data.order.collectionSlot);
    assert.equal((await post('/orders/'+b.id+'/declare-payment',{paymentDeclared:true},'other')).status,404);
    assert.equal((await post('/orders/'+b.id+'/declare-payment',{paymentDeclared:true})).status,200);
  } finally {await new Promise(r=>server.close(r));}
});
test('student and shop journey: verified PDF price, unique slot, busy gating, manual UPI, cash, ready and handover', async () => {
  const db=database(), objects=new Map();
  const bucket={ upload:async(path,bytes)=>objects.set(path,Buffer.from(bytes)), remove:async paths=>paths.forEach(p=>objects.delete(p)), file:path=>({getMetadata:async()=>[{size:objects.get(path).length,contentType:'application/octet-stream',generation:'1'}],createReadStream:()=>Readable.from([objects.get(path)])}) };
  const app=express();app.use(express.json());
  app.use((req,res,next)=>{const uid=req.get('x-user')||'student';req.student={uid,email:uid+'@kitsw.ac.in',email_verified:true};next();});
  const deps={db,bucket,paymentConfig:{mode:'manual',enabled:true,ordersCollection:'orders',quotaCollection:'quotas'},publicOrder:s=>({id:s.id,...s.data()}),FieldValue:{serverTimestamp:()=>Date.now()},env:{PRINT_OPERATOR_EMAILS:'shop@kitsw.ac.in',MERCHANT_UPI_REFERENCE:'example@bank',MERCHANT_UPI_ACCOUNT_NAME:'Test recipient'}};
  require('../server/upload-routes.cjs')(app,deps);require('../server/order-routes.cjs')(app,deps);require('../server/manual-routes.cjs')(app,deps);
  require('../server/shop-settings.cjs').registerShop(app,{db,isOperator:t=>t.uid==='shop'});
  app.use((e,req,res,next)=>res.status(e.httpStatus||500).json({error:e.message}));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+server.address().port+'/api';
  const post=async(path,body,user='student')=>{const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','X-User':user},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
  const pdf=await PDFDocument.create();for(let i=0;i<3;i++)pdf.addPage();const bytes=await pdf.save();
  async function upload(id) {const r=await fetch(base+'/uploads/'+id+'/'+randomUUID()+'?name=notes.pdf',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-File-Size':String(bytes.length)},body:bytes});assert.equal(r.status,201);return r.json();}
  const order=(id,path)=>({id,shop:'campus',paymentPreference:'online',notes:'',pickupTime:null,files:[{name:'notes.pdf',path,size:bytes.length,settings:{...require('../print-core.js').defaults,pages:3,copies:2}}]});
  try {
    const id=randomUUID(), file=await upload(id);assert.equal(file.pages,3);
    const input=order(id,file.path);input.files[0].settings.pages=1;assert.equal((await post('/orders',input)).status,409);
    input.files[0].settings.pages=3;
    const created=await post('/orders',input);assert.equal(created.status,201);assert.equal(created.data.order.quoteAmountPaise,3000);
    assert.equal((await post('/orders',input)).data.order.collectionSlot.number,created.data.order.collectionSlot.number);
    const nextId=randomUUID(), nextFile=await upload(nextId);
    await post('/shop',{acceptingOrders:false},'shop');assert.equal((await post('/orders',order(nextId,nextFile.path))).status,409);
    await post('/shop',{acceptingOrders:true},'shop');const second=(await post('/orders',order(nextId,nextFile.path))).data.order;
    assert.notDeepEqual(second.collectionSlot,created.data.order.collectionSlot);
    const info=await post('/orders/'+id+'/manual-instructions',{});assert.equal(info.data.amountPaise,3000);assert.match(info.data.qr,/^data:image\/png/);
    assert.equal((await post('/orders/'+id+'/manual-payment',{reference:'123456789012'})).data.status,'pending_verification');
    const list=await (await fetch(base+'/operator/orders',{headers:{'X-User':'shop'}})).json();const pending=list.orders.find(o=>o.id===id);
    const approval={decision:'approve',claimId:pending.manualPayment.claimId,receivedAmountPaise:3000,receiptChecked:true};
    assert.equal((await post('/operator/orders/'+id+'/payment-review',approval)).status,403);
    assert.equal((await post('/operator/orders/'+id+'/payment-review',approval,'shop')).status,200);
    for(const status of ['printing','ready','collected']) assert.equal((await post('/operator/orders/'+id+'/status',{status},'shop')).status,200);
    const download=await fetch(base+'/operator/orders/'+id+'/files/0',{headers:{'X-User':'shop'}});assert.deepEqual(Buffer.from(await download.arrayBuffer()),Buffer.from(bytes));
    await post('/orders/'+nextId+'/manual-instructions',{});
    assert.equal((await post('/operator/orders/'+nextId+'/cash',{amountPaise:3000,receiptChecked:true},'shop')).status,409);
    assert.equal((await post('/operator/orders/'+nextId+'/cash',{amountPaise:3000,receiptChecked:true,noUpiReceived:true},'shop')).status,200);
    const student=await (await fetch(base+'/orders')).json();assert.equal(student.orders.find(o=>o.id===id).status,'collected');
    // A manual-count document remains clearly distinguished through upload,
    // checkout and operator handling. Priority is priced once by the server.
    const manualId=randomUUID(),txt=Buffer.from('Report with application-dependent pagination');
    const manualUpload=await fetch(base+'/uploads/'+manualId+'/'+randomUUID()+'?name=report.txt',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-File-Size':String(txt.length)},body:txt});
    assert.equal(manualUpload.status,201);const manual=await manualUpload.json();assert.equal(manual.pageCountSource,'manual');
    const manualInput={...order(manualId,manual.path),priority:true,priorityFeePaise:0,files:[{name:'report.txt',path:manual.path,size:txt.length,settings:{...require('../print-core.js').defaults,pages:4}}]};
    const urgent=await post('/orders',manualInput);assert.equal(urgent.status,201);assert.equal(urgent.data.order.quoteAmountPaise,2800);assert.equal(urgent.data.order.files[0].pageCountSource,'manual');
    assert.equal((await post('/operator/orders/'+manualId+'/status',{status:'printing'},'shop')).status,409);
    const checked=await post('/operator/orders/'+manualId+'/status',{status:'printing',pagesChecked:true},'shop');assert.equal(checked.status,200);assert.equal(checked.data.order.status,'printing');
  } finally {await new Promise(r=>server.close(r));}
});
