function paymentConfiguration(env) {
  const mode = env.PAYMENT_MODE || 'off';
  const credentials = Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET && env.RAZORPAY_WEBHOOK_SECRET);
  const matchingKey = mode === 'test' ? /^rzp_test_/.test(env.RAZORPAY_KEY_ID || '') : mode === 'live' && /^rzp_live_/.test(env.RAZORPAY_KEY_ID || '');
  const manualReady = mode === 'manual' && /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z0-9.-]{2,64}$/.test(env.MERCHANT_UPI_REFERENCE || '') && Boolean(env.MERCHANT_UPI_ACCOUNT_NAME?.trim() && env.PRINT_OPERATOR_EMAILS?.trim());
  const declaredReady = mode === 'self_declared' && /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z0-9.-]{2,64}$/.test(env.MERCHANT_UPI_REFERENCE || '') && Boolean(env.MERCHANT_UPI_ACCOUNT_NAME?.trim());
  return {
    mode,
    enabled: env.KITSW_ENABLE_ORDERS === 'true' && (declaredReady || manualReady || (credentials && matchingKey && (mode === 'test' || env.KITSW_MERCHANT_VERIFIED === 'true'))),
    ordersCollection: mode === 'test' ? 'testOrders' : 'orders',
    paymentCollection: mode === 'test' ? 'testPaymentOrders' : 'paymentOrders',
    quotaCollection: mode === 'test' ? 'testOrderQuotas' : 'orderQuotas'
  };
}
module.exports = { paymentConfiguration };
