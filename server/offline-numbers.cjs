// This reservation pool and order creation/closure share one RTDB transaction.
const poolRef = (db, collection) => db.collection(collection === 'testOrders' ? 'testOfflineNumbers' : 'offlineNumbers').doc('active');
async function allocateOfflineNumber(tx, db, orderId, collection = 'orders', deadlineMs = null) {
  const ref = poolRef(db, collection);
  const holders = { ...((await tx.get(ref)).data()?.holders || {}) };
  for (let number = 1; number <= 1000; number++) {
    if ((holders[number]?.orderId || holders[number]) === orderId) return number;
    if (!holders[number]) { holders[number] = {orderId,deadlineMs}; tx.set(ref, { holders }); return number; }
  }
  throw Object.assign(Error('All 1,000 offline identification numbers are in use. Please try later or choose online payment.'), { httpStatus: 409 });
}
async function releaseOfflineNumber(tx, db, order, orderId, collection = 'orders') {
  if (!order.offlineNumber) return;
  const ref = poolRef(db, collection);
  const holders = { ...((await tx.get(ref)).data()?.holders || {}) };
  if ((holders[order.offlineNumber]?.orderId || holders[order.offlineNumber]) === orderId) { delete holders[order.offlineNumber]; tx.set(ref, { holders }); }
}
function isExpired(order, now = Date.now()) {
  return Boolean(order.offlineNumber && order.paymentStatus === 'unpaid' && ['accepted','submitted'].includes(order.status) && Number.isFinite(order.paymentAppointment?.deadlineMs) && now >= order.paymentAppointment.deadlineMs);
}
async function expireOfflineOrders(db, collection = 'orders', now = Date.now()) {
  const ref=poolRef(db,collection);
  const initial=(await ref.get()).data()?.holders || {};
  if (!Object.values(initial).some(h=>Number.isFinite(h?.deadlineMs)&&h.deadlineMs<=now)) return;
  await db.runTransaction(async tx=>{
    const holders={...((await tx.get(ref)).data()?.holders || {})};
    const candidates=Object.entries(holders).filter(([,h])=>Number.isFinite(h?.deadlineMs)&&h.deadlineMs<=now);
    const rows=await Promise.all(candidates.map(async([number,h])=>({number,ref:db.collection(collection).doc(h.orderId),order:(await tx.get(db.collection(collection).doc(h.orderId))).data()})));
    for(const row of rows) {
      if(isExpired(row.order,now)) {tx.update(row.ref,{status:'cancelled',closedMs:now,cancellationReason:'Payment appointment expired: no payment within one hour.'});delete holders[row.number];}
      else if(!row.order || ['collected','cancelled'].includes(row.order.status)) delete holders[row.number];
      else holders[row.number]={...holders[row.number],deadlineMs:null}; // Paid orders keep their number until handover.
    }
    tx.set(ref,{holders});
  });
}
function startOfflineExpiry(db) {
  let busy=false;
  const run=async()=>{if(busy)return;busy=true;try{for(const collection of ['orders','testOrders'])await expireOfflineOrders(db,collection);}catch{console.error('Offline expiry check failed; will retry.');}finally{busy=false;}};
  run();const timer=setInterval(run,60000);timer.unref();return timer;
}
module.exports = { allocateOfflineNumber, releaseOfflineNumber, expireOfflineOrders, isExpired, startOfflineExpiry };
