const crypto = require('node:crypto');
const core = require('../print-core.js');
const fail = (status,message) => Object.assign(Error(message),{httpStatus:status});
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function eligible(order,index,mode) {
  require('./payment-security.cjs').requireVerifiedPrintPayment(order,mode);
  if (!order || order.documentsDeleted || !['accepted','printing'].includes(order.status) || !['paid','declared_paid'].includes(order.paymentStatus)) throw fail(409,'An active paid order is required.');
  const file=order.files?.[index];
  if (!file || core.shopFileError(file,file.settings)) throw fail(409,'This file needs manual printing.');
  const estimate=core.estimate(file.settings,{image:core.isImageFile(file.name)});
  if(file.settings.colour==='colour'&&file.settings.sides==='double')throw fail(409,'Canon colour duplex requires manual paper turning. Use manual printing options.');
  if (file.settings.pages>1000 || estimate.printedSides>2000) throw fail(409,'Use manual printing for this large file.');
  return file;
}
function target(settings,printer) {
  if (!['kyocera-new','kyocera-old','canon'].includes(printer) || (settings.colour==='colour')!==(printer==='canon')) throw fail(400,'Choose a Kyocera for B&W or Canon for colour.');
  return printer;
}
module.exports=function mobilePrint({db,bucket,paymentConfig,env=process.env}) {
  const enabled=()=>{if(!db||!bucket)throw fail(503,'Order storage is unavailable.');};
  function refs(id,index) {
    if(!/^[a-f0-9-]{36}$/.test(id||'') || !/^[0-9]$/.test(String(index)))throw fail(400,'Invalid print target.');
    return {order:db.collection(paymentConfig.ordersCollection).doc(id),job:db.collection('mobilePrintJobs').doc(id+'-'+index)};
  }
  function ticket(req){const value=(req.get('authorization')||'').replace(/^Bearer /,'');if(!/^[a-f0-9]{64}$/.test(value))throw fail(403,'Invalid print ticket.');return value;}
  function valid(job,value,states=['issued']){if(!job||!states.includes(job.state)||job.expires<Date.now()||job.hash!==hash(value))throw fail(409,'Print request expired or already used. Check the printer before retrying.');}
  return {
    async issue(req,res){
      enabled();if(!require('./manual-payments.cjs').isOperator(req.student,env.PRINT_OPERATOR_EMAILS))throw fail(403,'Operator access required.');
      const {id,index}=req.params,r=refs(id,index),value=crypto.randomBytes(32).toString('hex');
      await db.runTransaction(async tx=>{
        const order=(await tx.get(r.order)).data(),previous=(await tx.get(r.job)).data(),file=eligible(order,index,paymentConfig.mode);
        if(order.uid===req.student.uid)throw fail(403,'Another operator must print your order.');
        if(order.paymentPreference==='offline'&&req.body.studentPresent!==true)throw fail(409,'Confirm the student is present.');
        if(previous&&(previous.state!=='issued'||(previous.actor!==req.student.uid&&previous.expires>Date.now())))throw fail(409,'A print request already exists. Check the printer before any manual reprint.');
        tx.set(r.job,{hash:hash(value),state:'issued',printer:target(file.settings,req.body.printer),actor:req.student.uid,expires:Date.now()+300000,createdMs:Date.now()});
      });res.json({id,index:Number(index),ticket:value});
    },
    async manifest(req,res){
      enabled();const value=ticket(req),r=refs(req.body?.id,req.body?.index),job=(await r.job.get()).data();valid(job,value);
      const file=eligible((await r.order.get()).data(),req.body.index,paymentConfig.mode),s=file.settings;
      res.json({printer:job.printer,settings:{size:'A4',colour:s.colour,sides:s.sides,orientation:s.orientation,duplexEdge:s.duplexEdge||'left-right'},printedSides:core.estimate(s,{image:core.isImageFile(file.name)}).printedSides});
    },
    async redeem(req,res){
      enabled();const value=ticket(req),r=refs(req.body?.id,req.body?.index);let file;
      await db.runTransaction(async tx=>{const job=(await tx.get(r.job)).data(),order=(await tx.get(r.order)).data();valid(job,value);file=eligible(order,req.body.index,paymentConfig.mode);tx.update(r.job,{state:'claimed',claimedMs:Date.now()});});
      const chunks=[];let length=0;
      for await(const chunk of bucket.file(file.path,{generation:file.generation}).createReadStream()){length+=chunk.length;if(length>25*1024*1024)throw fail(413,'File too large.');chunks.push(chunk);}
      const pdf=await require('./shop-print-pdf.cjs').prepare(Buffer.concat(chunks),file.name,file.settings);
      if(pdf.length>50*1024*1024)throw fail(413,'Prepared PDF exceeds the mobile limit. Use manual printing.');
      res.set('Cache-Control','no-store').type('application/pdf').send(pdf);
    },
    async result(req,res){
      enabled();const value=ticket(req),r=refs(req.body?.id,req.body?.index);
      if(!['submitted','uncertain'].includes(req.body.state))throw fail(400,'Invalid print result.');
      await db.runTransaction(async tx=>{const job=(await tx.get(r.job)).data();valid(job,value,['claimed','submitted','uncertain']);if(job.state!=='claimed')return;tx.update(r.job,{state:req.body.state,reportedMs:Date.now(),printerJobId:Number.isInteger(req.body.jobId)&&req.body.jobId>0?req.body.jobId:null});});
      // Receipt is not physical completion and never marks an order ready.
      res.json({ok:true});
    }
  };
};
module.exports.target=target;
