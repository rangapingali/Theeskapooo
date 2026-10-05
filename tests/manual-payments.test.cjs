const { test } = require('node:test');
const assert = require('node:assert/strict');
const logic = require('../server/manual-payments.cjs');
const { paymentConfiguration } = require('../server/payment-config.cjs');
const ready = () => ({ uid: 'student1', status: 'ready', paymentStatus: 'unpaid', reviewStatus: 'approved', quoteAmountPaise: 6000 });
const env = { MERCHANT_UPI_REFERENCE: 'someone@fam', MERCHANT_UPI_ACCOUNT_NAME: 'Example recipient' };
function pending() { return { ...ready(), paymentStatus: 'pending_verification', lockedAmountPaise: 6000, manualPayment: { claimId: 'claim1', reference: '123456789012', amountPaise: 6000, payee: { upiId: 'someone@fam', name: 'Example recipient' } } }; }
test('operator access requires an exact allowlisted verified email; student role is not changed', () => {
  assert.equal(logic.isOperator({ email: 'student@kitsw.ac.in', email_verified: true }, 'student@kitsw.ac.in'), true);
  assert.equal(logic.isOperator({ email: 'other@kitsw.ac.in', email_verified: true }, 'student@kitsw.ac.in'), false);
  assert.equal(logic.isOperator({ email: 'student@kitsw.ac.in', email_verified: false }, 'student@kitsw.ac.in'), false);
  assert.equal(logic.isOperator({ email: 'student@kitsw.ac.in', email_verified: true }, ''), false);
});
test('manual mode needs order server, payee and operator but no gateway secrets', () => {
  const base = { ...env, PAYMENT_MODE: 'manual', KITSW_ENABLE_ORDERS: 'true', PRINT_OPERATOR_EMAILS: 'operator@kitsw.ac.in' };
  assert.equal(paymentConfiguration(base).enabled, true);
  assert.equal(paymentConfiguration({ ...base, PRINT_OPERATOR_EMAILS: '' }).enabled, false);
  assert.equal(paymentConfiguration({ ...base, KITSW_ENABLE_ORDERS: 'false' }).enabled, false);
});
test('manual instructions lock the real quote and use UPI parameters without claiming bank verification', () => {
  const result = logic.instructions(ready(), '2b126772-0493-4684-9ebc-b1c28a589192', env);
  const uri = new URL(result.uri);
  assert.equal(uri.searchParams.get('pa'), 'someone@fam'); assert.equal(uri.searchParams.get('am'), '60.00');
  assert.equal(uri.searchParams.get('cu'), 'INR'); assert.equal(result.amountPaise, 6000);
  assert.throws(() => logic.instructions({ ...ready(), lockedAmountPaise: 100 }, 'id', env));
  assert.throws(() => logic.instructions({ ...ready(), paymentStatus: 'paid' }, 'id', env));
  assert.throws(() => logic.instructions({ ...ready(), providerOrderId: 'order_previous' }, 'id', env));
});
test('a student claim is pending, never paid, and uses only a validated reference', () => {
  const order = { ...ready(), manualPayee: { upiId: 'someone@fam', name: 'Example' }, lockedAmountPaise: 6000 };
  const patch = logic.claimPatch(order, ' abc12345 ', 'claim1');
  assert.equal(patch.paymentStatus, 'pending_verification'); assert.equal(patch.manualPayment.reference, 'ABC12345');
  assert.throws(() => logic.claimPatch(order, '<script>', 'claim1'));
  assert.throws(() => logic.claimPatch({ ...order, paymentStatus: 'pending_verification' }, 'ABC12345', 'claim1'));
});
test('approval needs recipient evidence, exact amount and current claim; own payments are blocked', () => {
  const body = { decision: 'approve', claimId: 'claim1', receivedAmountPaise: 6000, receiptChecked: true };
  const patch = logic.decisionPatch(pending(), { uid: 'operator1' }, body);
  assert.equal(patch.paymentStatus, 'paid'); assert.equal(patch.paymentMethod, 'manual_upi');
  assert.throws(() => logic.decisionPatch(pending(), { uid: 'student1' }, body));
  for (const changed of [{ claimId: 'old' }, { receivedAmountPaise: 1 }, { receiptChecked: false }, { decision: 'set-paid' }]) assert.throws(() => logic.decisionPatch(pending(), { uid: 'operator1' }, { ...body, ...changed }));
  assert.throws(() => logic.decisionPatch({ ...pending(), paymentStatus: 'paid' }, { uid: 'operator1' }, body));
});
test('rejection needs a reason and does not mark paid; reference hashes normalize case', () => {
  const body = { decision: 'reject', claimId: 'claim1', reason: 'No matching credit in recipient account.' };
  assert.equal(logic.decisionPatch(pending(), { uid: 'operator1' }, body).paymentStatus, 'rejected');
  assert.throws(() => logic.decisionPatch(pending(), { uid: 'operator1' }, { ...body, reason: '' }));
  assert.equal(logic.referenceKey('SOMEONE@fam', 'abc12345'), logic.referenceKey('someone@fam', 'ABC12345'));
});
test('quotes lock after payment starts and unpaid orders cannot be marked collected', () => {
  assert.equal(logic.quotePatch({ ...ready(), status: 'submitted' }, 5000).status, 'accepted');
  assert.throws(() => logic.quotePatch({ ...ready(), lockedAmountPaise: 6000 }, 5000));
  assert.throws(() => logic.statusPatch(ready(), 'collected'));
  assert.equal(logic.statusPatch({ ...ready(), paymentStatus: 'paid' }, 'collected').status, 'collected');
  assert.throws(() => logic.statusPatch({ ...ready(), status: 'submitted' }, 'ready'));
});
