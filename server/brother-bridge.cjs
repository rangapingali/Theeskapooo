const crypto = require('node:crypto');
const core = require('../print-core.js');
const fail = (status, message) => Object.assign(new Error(message), { httpStatus: status });
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function eligible(order, index) {
  if (!order || order.documentsDeleted || !['accepted','printing'].includes(order.status) || !['paid','declared_paid'].includes(order.paymentStatus)) throw fail(409,'An active paid order is required.');
  const file = order.files?.[index];
  if (!file || !/\.(pdf|png)$/i.test(file.name)) throw fail(400,'Choose a PDF or PNG.');
  core.estimate(file.settings);
  if (file.settings.colour !== 'bw' || file.settings.size !== 'A4' || file.settings.binding !== 'none') throw fail(400,'Brother test supports B&W A4 without binding only.');
  if (file.settings.pages > 200 || file.settings.copies > 20 || core.estimate(file.settings).printedSides > 200) throw fail(400,'Home test limit: 200 printed sides and 20 copies.');
  return file;
}
module.exports = function bridge(deps) {
  const {db,bucket,paymentConfig,env=process.env}=deps;
  const enabled=()=>env.BROTHER_TEST_BRIDGE === 'true';
  function refs(id,index) {
    if(!/^[a-f0-9-]{36}$/.test(id)||!/^\d$/.test(String(index))) throw fail(400,'Invalid print target.');
    return {order:db.collection(paymentConfig.ordersCollection).doc(id),job:db.collection('brotherTestJobs').doc(id+'-'+index)};
  }
  return {
    async issue(req,res) {
      if(!enabled())throw fail(404,'Brother test bridge is disabled.');
      if(!require('./manual-payments.cjs').isOperator(req.student,env.PRINT_OPERATOR_EMAILS))throw fail(403,'Operator access required.');
      const {id,index}=req.params, r=refs(id,index),ticket=crypto.randomBytes(32).toString('hex');
      await db.runTransaction(async tx=>{
        const order=(await tx.get(r.order)).data(), prior=(await tx.get(r.job)).data();
        eligible(order,index);
        if(order.uid===req.student.uid)throw fail(403,'Another operator must print your order.');
        if(order.paymentPreference==='offline'&&req.body.studentPresent!==true)throw fail(409,'Confirm the student is present.');
        if(prior && (prior.state==='claimed'||(prior.expires>Date.now()&&prior.actor!==req.student.uid)))throw fail(409,'This file already has a print request. Check the laptop/spooler before any reprint; automatic retries are blocked.');
        tx.set(r.job,{hash:hash(ticket),expires:Date.now()+120000,state:'issued',actor:req.student.uid,createdMs:Date.now()});
      });
      res.json({id,index:Number(index),ticket});
    },
    async redeem(req,res) {
      if(!enabled())throw fail(404,'Brother test bridge is disabled.');
      const ticket=(req.get('authorization')||'').replace(/^Bearer /,'');
      if(!/^[a-f0-9]{64}$/.test(ticket))throw fail(403,'Invalid print ticket.');
      const {id,index}=req.body||{},r=refs(id,index);let file;
      await db.runTransaction(async tx=>{
        const job=(await tx.get(r.job)).data(),order=(await tx.get(r.order)).data();
        if(!job||job.state!=='issued'||job.expires<Date.now()||job.hash!==hash(ticket))throw fail(409,'Print ticket expired or already used. Check the printer before retrying.');
        file=eligible(order,index);
        tx.update(r.job,{state:'claimed',claimedMs:Date.now()});
      });
      const chunks=[];let size=0;
      for await(const chunk of bucket.file(file.path,{generation:file.generation}).createReadStream()) {
        size+=chunk.length;if(size>25*1024*1024)throw fail(413,'File too large.');chunks.push(chunk);
      }
      res.json({name:file.name,settings:file.settings,bytes:Buffer.concat(chunks).toString('base64')});
    }
  };
};
module.exports.eligible=eligible;
