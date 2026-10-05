const { applicationDefault } = require('firebase-admin/app');
const { createStore, DATABASE_URL } = require('./realtime-store.cjs');
const core = require('../print-core.js');
// Only previously unpriced, unpaid orders are eligible. Never alter a payment in progress.
function fixedPatch(order) {
  if (order.status !== 'submitted' || order.paymentStatus !== 'unpaid' || order.quoteAmountPaise != null || order.lockedAmountPaise || order.providerOrderId || order.manualPayee) return null;
  const estimate = { amount: 0, sheets: 0, printedSides: 0, minutes: 0, needsQuote: false };
  for (const file of order.files) {
    const item = core.estimate(file.settings);
    if (item.needsQuote) return null;
    for (const key of ['amount', 'sheets', 'printedSides', 'minutes']) estimate[key] += item[key];
  }
  const amount = Math.round(estimate.amount * 100);
  if (amount <= 0 || amount > 5000000) return null;
  return { status: 'accepted', reviewStatus: 'approved', quoteAmountPaise: amount, pricingMode: 'fixed', estimate };
}
async function main() {
  const db = createStore({ credential: applicationDefault(), databaseURL: process.env.FIREBASE_DATABASE_URL || DATABASE_URL });
  let updated = 0;
  for (const name of ['orders', 'testOrders']) {
    for (const row of (await db.collection(name).get()).docs) {
      let changed = false;
      await db.runTransaction(async tx => {
        changed = false;
        const ref = db.collection(name).doc(row.id), order = (await tx.get(ref)).data();
        const patch = fixedPatch(order);
        if (patch) { tx.update(ref, patch); changed = true; }
      });
      if (changed) updated++;
    }
  }
  console.log('Previously unpriced orders moved to fixed pricing:', updated);
}
if (require.main === module) main().catch(() => { console.error('Fixed-price migration failed; no payment changes requested.'); process.exitCode = 1; });
module.exports = { fixedPatch };
