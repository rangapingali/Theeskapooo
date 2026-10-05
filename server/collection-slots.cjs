const HOUR = 3600000, IST = 5.5 * HOUR;
function firstSlot(now) {
  const local = new Date(now + IST);
  let hour = local.getUTCHours();
  if (hour >= 17) { local.setUTCDate(local.getUTCDate() + 1); hour = 9; }
  return { date: local.toISOString().slice(0, 10), slot: Math.max(9, hour) - 8 };
}
function nextSlot({ date, slot }) {
  if (slot < 8) return { date, slot: slot + 1 };
  return { date: new Date(Date.parse(date + 'T00:00:00Z') + 24 * HOUR).toISOString().slice(0, 10), slot: 1 };
}
async function allocateSlot(tx, db, now, collection = 'orders') {
  let candidate = firstSlot(now);
  for (let i = 0; i < 8 * 31; i++) {
    const ref = db.collection(collection === 'testOrders' ? 'testSlotCounters' : 'slotCounters').doc(candidate.date + '-' + candidate.slot);
    const count = (await tx.get(ref)).data()?.count || 0;
    if (!Number.isInteger(count) || count < 0 || count > 100) throw new Error('Invalid slot counter');
    if (count < 100) {
      tx.set(ref, { count: count + 1 });
      return { ...candidate, number: count + 1, startHour: candidate.slot + 8, endHour: candidate.slot + 9 };
    }
    candidate = nextSlot(candidate);
  }
  throw Object.assign(new Error('All collection slots are full. Please contact the shop.'), { httpStatus: 409 });
}
module.exports = { firstSlot, nextSlot, allocateSlot };
