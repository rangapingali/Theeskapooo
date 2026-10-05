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
        eligible = order && ['collected', 'cancelled'].includes(order.status) && Number.isFinite(order.closedMs) && now - order.closedMs >= 24 * 3600000;
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
function startCleanup(deps) {
  let busy = false;
  const run = async () => {
    if (busy) return; busy = true;
    try { await cleanupDocuments(deps); } catch { console.error('Document cleanup failed; will retry.'); } finally { busy = false; }
  };
  void run(); const timer = setInterval(run, 3600000); timer.unref(); return timer;
}
module.exports = { cleanupDocuments, startCleanup };
