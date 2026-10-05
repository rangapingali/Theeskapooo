const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixedPatch } = require('../server/migrate-fixed-prices.cjs');
const core = require('../print-core.js');
test('fixed totals use confirmed rates for all sizes, copies, range, n-up and duplex', () => {
  for (const size of ['A4', 'A3', 'Letter', 'Legal']) {
    const order = { status: 'submitted', paymentStatus: 'unpaid', files: [{ settings: { ...core.defaults, size, copies: 2, pages: 8, range: '1-5', layout: 2, sides: 'double', colour: 'colour' } }] };
    assert.equal(fixedPatch(order).quoteAmountPaise, 6000);
    assert.equal(fixedPatch({ ...order, lockedAmountPaise: 500 }), null);
    assert.equal(fixedPatch({ ...order, paymentStatus: 'paid' }), null);
    order.files[0].settings.binding = 'spiral'; assert.equal(fixedPatch(order), null);
  }
});
