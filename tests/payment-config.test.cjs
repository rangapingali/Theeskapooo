const { test } = require('node:test');
const assert = require('node:assert/strict');
const { paymentConfiguration } = require('../server/payment-config.cjs');
const base = { KITSW_ENABLE_ORDERS: 'true', RAZORPAY_KEY_ID: 'rzp_test_example', RAZORPAY_KEY_SECRET: 'test-secret', RAZORPAY_WEBHOOK_SECRET: 'test-webhook' };
test('student declaration mode requires a configured payee but no approver or gateway', () => {
  const env={KITSW_ENABLE_ORDERS:'true',PAYMENT_MODE:'self_declared',MERCHANT_UPI_REFERENCE:'test@bank',MERCHANT_UPI_ACCOUNT_NAME:'Test'};
  assert.equal(paymentConfiguration(env).enabled,true);
  assert.equal(paymentConfiguration({...env,MERCHANT_UPI_REFERENCE:''}).enabled,false);
  assert.equal(paymentConfiguration({...env,KITSW_ENABLE_ORDERS:'false'}).enabled,false);
});
test('test mode does not require live merchant verification and isolates order records', () => {
  const config = paymentConfiguration({ ...base, PAYMENT_MODE: 'test' });
  assert.equal(config.enabled, true);
  assert.equal(config.ordersCollection, 'testOrders');
  assert.equal(config.paymentCollection, 'testPaymentOrders');
});
test('test mode refuses live keys and live mode refuses test keys', () => {
  assert.equal(paymentConfiguration({ ...base, PAYMENT_MODE: 'test', RAZORPAY_KEY_ID: 'rzp_live_example' }).enabled, false);
  assert.equal(paymentConfiguration({ ...base, PAYMENT_MODE: 'live', KITSW_MERCHANT_VERIFIED: 'true' }).enabled, false);
});
test('live payments require explicit mode, live keys and verified merchant setup', () => {
  const live = { ...base, RAZORPAY_KEY_ID: 'rzp_live_example', PAYMENT_MODE: 'live' };
  assert.equal(paymentConfiguration(live).enabled, false);
  assert.equal(paymentConfiguration({ ...live, KITSW_MERCHANT_VERIFIED: 'true' }).enabled, true);
  assert.equal(paymentConfiguration(base).enabled, false);
  assert.equal(paymentConfiguration({ ...base, PAYMENT_MODE: 'test', RAZORPAY_WEBHOOK_SECRET: '' }).enabled, false);
});
