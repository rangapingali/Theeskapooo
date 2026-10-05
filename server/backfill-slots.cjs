const { applicationDefault } = require('firebase-admin/app');
const { createStore, DATABASE_URL } = require('./realtime-store.cjs');
const { allocateSlot } = require('./collection-slots.cjs');
(async () => {
  const db = createStore({ credential: applicationDefault(), databaseURL: process.env.FIREBASE_DATABASE_URL || DATABASE_URL });
  let assigned = 0;
  for (const name of ['orders', 'testOrders']) {
    const rows = await db.collection(name).orderBy('createdAt', 'asc').get();
    for (const row of rows.docs) {
      let changed;
      await db.runTransaction(async tx => {
        changed = false; const ref = db.collection(name).doc(row.id); const order = (await tx.get(ref)).data();
        if (!order || order.collectionSlot || ['collected', 'cancelled'].includes(order.status)) return;
        const time = order.createdAt.toDate().getTime();
        if (!Number.isFinite(time)) throw Error('Order time is missing');
        const collectionSlot = await allocateSlot(tx, db, time, name);
        tx.update(ref, { collectionSlot }); changed = true;
      });
      if (changed) assigned++;
    }
  }
  console.log('Active orders assigned collection codes:', assigned);
})().catch(() => { console.error('Slot backfill failed; no payment data was changed.'); process.exitCode = 1; });
