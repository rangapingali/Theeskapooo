const { test } = require('node:test');
const assert = require('node:assert/strict');
const { firstSlot, allocateSlot } = require('../server/collection-slots.cjs');
test('slots use India order time at opening, hour boundaries, closing and month rollover', () => {
  assert.deepEqual(firstSlot(Date.parse('2026-10-04T08:30:00+05:30')), { date: '2026-10-04', slot: 1 });
  assert.equal(firstSlot(Date.parse('2026-10-04T09:59:59+05:30')).slot, 1);
  assert.equal(firstSlot(Date.parse('2026-10-04T10:00:00+05:30')).slot, 2);
  assert.equal(firstSlot(Date.parse('2026-10-04T16:59:59+05:30')).slot, 8);
  assert.deepEqual(firstSlot(Date.parse('2026-10-31T17:00:00+05:30')), { date: '2026-11-01', slot: 1 });
});
test('numbering never reuses a number, spills at 100, and isolates test orders', async () => {
  const records = new Map();
  const db = { collection: name => ({ doc: id => name + '/' + id }) };
  const tx = { get: async ref => ({ data: () => records.get(ref) }), set: (ref, data) => records.set(ref, data) };
  const now = Date.parse('2026-10-04T09:00:00+05:30');
  const codes = new Set();
  for (let i = 0; i < 101; i++) {
    const s = await allocateSlot(tx, db, now);
    const code = `${s.date}/${s.slot}/${s.number}`; assert.equal(codes.has(code), false); codes.add(code);
    assert.equal(s.slot, i < 100 ? 1 : 2); assert.equal(s.number, i < 100 ? i + 1 : 1);
  }
  assert.equal((await allocateSlot(tx, db, now, 'testOrders')).number, 1);
  records.set('slotCounters/2026-10-04-8', { count: 100 });
  const next = await allocateSlot(tx, db, Date.parse('2026-10-04T16:30:00+05:30'));
  assert.deepEqual([next.date, next.slot, next.number], ['2026-10-05', 1, 1]);
});
