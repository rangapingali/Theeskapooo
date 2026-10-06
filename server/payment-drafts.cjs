const { createHash } = require('node:crypto');
const QRCode = require('qrcode');
const { validateOrder } = require('./order-validation.cjs');
const { instructions } = require('./manual-payments.cjs');
const fail = (code, message) => Object.assign(Error(message), { httpStatus: code });
const fingerprint = input => createHash('sha256').update(JSON.stringify(input)).digest('hex');
function checkSession(input, session, uid) {
  if (!session || session.uid !== uid || session.state !== 'open' || Date.now() - session.createdMs >= 48*3600000) throw fail(409,'Upload session expired. Please select your files again.');
  for(const file of input.files) {
    const verified = Object.values(session.files || {}).find(f => f.path === file.path && f.size === file.size);
    if (!verified || (!Number.isInteger(verified.pages) && verified.pageCountSource !== 'manual')) throw fail(400,'Wait for the documents to finish uploading.');
    if (verified.pageCountSource !== 'manual' && verified.pages !== file.settings.pages) throw fail(409,'Page count changed. Review your file before payment.');
  }
}
module.exports = function registerDrafts(app,{db,paymentConfig,publicOrder,env}) {
  app.post('/api/payment-drafts',async(req,res)=>{
    if(paymentConfig.mode!=='self_declared'||!paymentConfig.enabled)throw fail(503,'Student payment declarations are not enabled.');
    let input;try{input=validateOrder(req.body,req.student.uid);}catch(e){throw fail(400,e.message);}
    const amountPaise=Math.round(input.estimate.amount*100);
    if(input.estimate.needsQuote||!Number.isSafeInteger(amountPaise)||amountPaise<100||amountPaise>5000000)throw fail(400,'Check the print settings and total before payment.');
    const ref=db.collection('paymentDrafts').doc(input.id);
    const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata'}).format(new Date()).replaceAll('/','-');
    let info,existingOrder;
    await db.runTransaction(async tx=>{
      const saved=await tx.get(db.collection(paymentConfig.ordersCollection).doc(input.id));
      if(saved.exists){if(saved.data().uid!==req.student.uid)throw fail(409,'Start a new checkout.');existingOrder=publicOrder(saved);return;}
      require('./shop-settings.cjs').requireOpen((await tx.get(db.collection('settings').doc('shop'))).data());
      const quota=(await tx.get(db.collection(paymentConfig.quotaCollection).doc(req.student.uid+'-'+day))).data();
      if((quota?.count||0)>=30)throw fail(429,'Daily order limit reached. Contact the shop before paying.');
      checkSession(input,(await tx.get(db.collection('uploadSessions').doc(input.id))).data(),req.student.uid);
      const old=(await tx.get(ref)).data(), hash=fingerprint(input);
      if(old && (old.uid!==req.student.uid||old.requestHash!==hash))throw fail(409,'Checkout details changed. Start a new checkout.');
      if(old && Date.now()-old.createdMs>=24*3600000)throw fail(409,'This checkout expired. Contact the shop if you already transferred money.');
      info=instructions({status:'checkout',paymentStatus:'unpaid',reviewStatus:'approved',quoteAmountPaise:amountPaise,manualPayee:old?.payee},input.id,env);
      if(!old)tx.create(ref,{uid:req.student.uid,requestHash:hash,amountPaise,payee:info.payee,createdMs:Date.now(),state:'open'});
    });
    if(existingOrder)return res.json({order:existingOrder});
    res.json({...info,qr:await QRCode.toDataURL(info.uri,{width:256,margin:2}),verifiedByBank:false});
  });
};
module.exports.fingerprint=fingerprint;
