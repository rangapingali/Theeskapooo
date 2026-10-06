// Records remain; only document objects are removed. Runs on server startup and hourly.
async function cleanupDocuments({ db, bucket, now = Date.now() }) {
  const sessions = await db.collection('uploadSessions').get();
  for (const row of sessions.docs) {
    const ref = db.collection('uploadSessions').doc(row.id);
    let paths;
    await db.runTransaction(async tx => {
      paths = undefined;
      const session = (await tx.get(ref)).data();
      if (!session || session.state === 'deleted') return;
      let eligible = session.state === 'deleting';
      if (session.state === 'open') eligible = now - session.createdMs >= 48 * 3600000;
      if (session.state === 'ordered') {
        const order = (await tx.get(db.collection(session.collection).doc(row.id))).data();
        eligible = order?.status === 'collected' || (order?.status === 'cancelled' && Number.isFinite(order.closedMs) && now - order.closedMs >= 24 * 3600000);
      }
      if (!eligible) return;
      paths = Object.values(session.files || {}).map(f => f.path);
      tx.update(ref, { state: 'deleting' });
    });
    if (!paths) continue;
    await bucket.remove(paths);
    await db.runTransaction(async tx => {
      const session = (await tx.get(ref)).data();
      if (session.state !== 'deleting') return;
      tx.update(ref, { state: 'deleted', deletedMs: now });
      if (session.collection) tx.update(db.collection(session.collection).doc(row.id), { documentsDeleted: true });
    });
  }
}
async function deleteOrderDocuments({ db, bucket, collection, orderId, now = Date.now() }) {
  const sessionRef = db.collection('uploadSessions').doc(orderId);
  const orderRef = db.collection(collection).doc(orderId);
  let paths;
  await db.runTransaction(async tx => {
    paths = undefined;
    const [sessionSnapshot, orderSnapshot] = await Promise.all([tx.get(sessionRef), tx.get(orderRef)]);
    const session = sessionSnapshot.data();
    const order = orderSnapshot.data();
    if (!order || order.status !== 'collected' || order.documentsDeleted) return;
    if (session?.state === 'deleted') {
      tx.update(orderRef, { documentsDeleted: true });
      paths = [];
      return;
    }
    paths = session
      ? Object.values(session.files || {}).map(file => file.path).filter(path => typeof path === 'string')
      : (order.files || []).map(file => file.path).filter(path => typeof path === 'string');
    if (session) tx.update(sessionRef, { state: 'deleting' });
    else tx.set(sessionRef, { state: 'deleting', collection, files: Object.fromEntries(paths.map((path, index) => [String(index), { path }])) });
  });
  if (!paths) return false;
  await bucket.remove(paths);
  await db.runTransaction(async tx => {
    const [sessionSnapshot, orderSnapshot] = await Promise.all([tx.get(sessionRef), tx.get(orderRef)]);
    const session = sessionSnapshot.data();
    const order = orderSnapshot.data();
    if (session?.state === 'deleting') tx.update(sessionRef, { state: 'deleted', deletedMs: now });
    if (order && !order.documentsDeleted) tx.update(orderRef, { documentsDeleted: true });
  });
  return true;
}
function startCleanup(deps) {
  let busy = false;
  const run = async () => {
    if (busy) return; busy = true;
    try { await cleanupDocuments(deps); } catch { console.error('Document cleanup failed; will retry.'); } finally { busy = false; }
  };
  void run(); const timer = setInterval(run, 3600000); timer.unref(); return timer;
}
module.exports = { cleanupDocuments, deleteOrderDocuments, startCleanup };
