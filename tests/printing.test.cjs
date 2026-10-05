const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const core = require('../print-core.js');
const { validateOrder } = require('../server/order-validation.cjs');
const { validSignature, assertCaptured } = require('../server/payment-security.cjs');
test('page range parsing deduplicates overlaps and rejects invalid pages', () => {
  assert.equal(core.pageCount('1-3, 3, 5, 7-8', 10), 6);
  for (const input of ['0', '4-2', '1-11', '1,,2', '1.5', '1e2', '1-']) assert.throws(() => core.pageCount(input, 10));
  assert.equal(core.pageCount('', 12), 12);
});
test('A4 estimates use confirmed rates and round duplex sheets per copy', () => {
  const bw = core.estimate({ ...core.defaults, pages: 5, copies: 2, sides: 'double' });
  assert.equal(bw.amount, 50); assert.equal(bw.printedSides, 10); assert.equal(bw.sheets, 6);
  assert.equal(core.estimate({ ...core.defaults, pages: 5, colour: 'colour' }).amount, 50);
  const multiple = core.estimate({ ...core.defaults, pages: 5, layout: 2, copies: 2, sides: 'double' });
  assert.equal(multiple.printedSides, 6); assert.equal(multiple.sheets, 4); assert.equal(multiple.amount, 30);
});
test('all paper sizes use confirmed rates; unpriced binding remains unavailable', () => {
  const a3 = core.estimate({ ...core.defaults, size: 'A3' });
  assert.equal(a3.amount, 5); assert.equal(a3.needsQuote, false);
  assert.equal(core.estimate({ ...core.defaults, binding: 'spiral' }).needsQuote, true);
});
test('invalid print options and unsafe/oversized uploads are rejected', () => {
  for (const copies of [0, -1, 1.5, 501, NaN]) assert.throws(() => core.estimate({ ...core.defaults, copies }));
  assert.throws(() => core.estimate({ ...core.defaults, colour: 'free' }));
  for (const name of ['run.exe','page.html','vector.svg','archive.zip']) assert.ok(core.fileError({ name, size: 50 }));
  assert.ok(core.fileError({ name: 'test.pdf', size: 26 * 1024 * 1024 }));
});
function fixture() {
  const id = crypto.randomUUID();
  return { id, shop: 'campus', notes: '', pickupTime: null, paymentPreference: 'offline', files: [{ name: 'report.pdf', size: 500, path: `student-uploads/student1/${id}/${crypto.randomUUID()}.pdf`, settings: { ...core.defaults, pages: 4 } }] };
}
test('server validates ownership references and ignores client-supplied totals and status', () => {
  const input = fixture(); input.estimate = { amount: 0 }; input.paymentStatus = 'paid';
  const result = validateOrder(input, 'student1');
  assert.equal(result.estimate.amount, 20); assert.equal(result.paymentStatus, undefined);
  assert.throws(() => validateOrder(input, 'another-student'));
  input.files.push(input.files[0]); assert.throws(() => validateOrder(input, 'student1'), /duplicate/);
});
test('server rejects format mismatch and oversized notes', () => {
  const input = fixture(); input.files[0].path = input.files[0].path.replace('.pdf', '.exe');
  assert.throws(() => validateOrder(input, 'student1'), /mismatch/);
  const note = fixture(); note.notes = 'x'.repeat(501); assert.throws(() => validateOrder(note, 'student1'));
});

test('priority costs exactly eight rupees per order regardless of copies and client totals',()=>{
  const input=fixture();input.priority=true;input.priorityFeePaise=1;input.files[0].settings.copies=3;
  const result=validateOrder(input,'student1');assert.equal(result.estimate.amount,68);assert.equal(result.priorityFeePaise,800);
  input.priority=false;assert.equal(validateOrder(input,'student1').estimate.amount,60);
  input.priority='yes';assert.throws(()=>validateOrder(input,'student1'),/urgency/);
});
test('payment HMAC rejects modified signatures and missing secrets', () => {
  const body = 'order_example|pay_example'; const secret = 'test-secret-only';
  const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');
  assert.equal(validSignature(body, signature, secret), true);
  assert.equal(validSignature(body + 'tamper', signature, secret), false);
  assert.equal(validSignature(body, 'bad', secret), false);
  assert.equal(validSignature(body, signature, ''), false);
});
test('only a captured payment with matching amount, currency and order is accepted', () => {
  const order = { providerOrderId: 'order_example', quoteAmountPaise: 5000 };
  const payment = { order_id: 'order_example', amount: 5000, currency: 'INR', status: 'captured', captured: true, amount_refunded: 0 };
  assert.doesNotThrow(() => assertCaptured(payment, order));
  for (const altered of [{ amount: 1 }, { currency: 'USD' }, { order_id: 'other' }, { status: 'authorized' }, { captured: false }, { amount_refunded: 1 }]) assert.throws(() => assertCaptured({ ...payment, ...altered }, order));
});
