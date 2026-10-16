const {isAdmin}=require('./access-roles.cjs');
module.exports=function(app,{db,paymentConfig,env=process.env}){
 const fail=(httpStatus,message)=>Object.assign(Error(message),{httpStatus});
 app.use('/api/admin',(req,res,next)=>isAdmin(req.student,env)?next():next(fail(403,'Administrator access required.')));
 app.get('/api/admin/overview',async(req,res)=>{
  const [orders,shop]=await Promise.all([db.collection(paymentConfig.ordersCollection).orderBy('createdAt','desc').get(),db.collection('settings').doc('shop').get()]);
  const rows=orders.docs.map(doc=>{const o=doc.data();return {id:doc.id,email:o.email||'',status:o.status,paymentStatus:o.paymentStatus,paymentReconciliationRequired:o.paymentReconciliationRequired===true,paymentPreference:o.paymentPreference,amountPaise:o.quoteAmountPaise||0,paymentReceivedMs:o.paymentReceivedMs||null,priority:o.priority===true,slot:o.collectionSlot||null,offlineNumber:o.offlineNumber||null,createdAt:o.createdAt?.toDate?.().toISOString()||null,documentsDeleted:o.documentsDeleted===true};});
  res.json({orders:rows,acceptingOrders:shop.data()?.acceptingOrders!==false,paymentMode:paymentConfig.mode,operatorEmails:((env.PRINT_OPERATOR_EMAILS||'')+','+(env.PRINT_ADMIN_EMAILS||'rangapingali@gmail.com')).split(',').map(s=>s.trim()).filter(s=>s&&s.toLowerCase()!=='b25ai163@kitsw.ac.in')});
 });
 app.post('/api/admin/shop',async(req,res)=>{
  if(typeof req.body.acceptingOrders!=='boolean')throw fail(400,'Choose whether to accept orders.');
  await db.runTransaction(async tx=>{tx.set(db.collection('settings').doc('shop'),{acceptingOrders:req.body.acceptingOrders,updatedBy:req.student.uid,updatedMs:Date.now()});tx.create(db.collection('adminAudit').doc(),{actorUid:req.student.uid,action:'shop_availability',acceptingOrders:req.body.acceptingOrders,atMs:Date.now()});});
  res.json({acceptingOrders:req.body.acceptingOrders});
 });
 app.get('/api/admin/audit',async(req,res)=>{const list=await db.collection('adminAudit').orderBy('atMs','desc').limit(100).get();res.json({events:list.docs.map(d=>({id:d.id,...d.data()}))});});
};
