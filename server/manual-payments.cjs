const crypto = require('node:crypto');
function fail(message) { throw Object.assign(new Error(message), { httpStatus: 409 }); }
function isOperator(token, emails = '') {
  const allowed = emails.split(',').map(email => email.trim().toLowerCase()).filter(Boolean);
  return token?.email_verified === true && allowed.includes((token.email || '').toLowerCase());
}
function checkPayable(order) {
  if (['paid','declared_paid'].includes(order.paymentStatus)) fail('Payment is already recorded for this order.');
  if (['cancelled','collected'].includes(order.status)) fail('This order is no longer payable.');
  if (order.reviewStatus !== 'approved' || !Number.isInteger(order.quoteAmountPaise) || order.quoteAmountPaise <= 0) fail('The operator must review your files and confirm the amount first.');
  if (order.providerOrderId || ['creating','created'].includes(order.checkoutState)) fail('A gateway checkout already exists. Contact the operator before sending another payment.');
}
function instructions(order, orderId, env) {
  checkPayable(order);
  const payee = order.manualPayee || { upiId: env.MERCHANT_UPI_REFERENCE, name: env.MERCHANT_UPI_ACCOUNT_NAME };
  if (!/^[a-zA-Z0-9._-]{2,256}@[a-zA-Z0-9.-]{2,64}$/.test(payee.upiId || '') || !payee.name?.trim()) fail('Payment recipient is not configured.');
  if (order.lockedAmountPaise && order.lockedAmountPaise !== order.quoteAmountPaise) fail('The quote changed after payment instructions were issued. Contact the operator.');
  const amountPaise = order.lockedAmountPaise || order.quoteAmountPaise;
  const params = new URLSearchParams({ pa: payee.upiId, pn: payee.name, am: (amountPaise / 100).toFixed(2), cu: 'INR', tn: 'KITSW ' + orderId.slice(0,8), tr: orderId.replaceAll('-', '').slice(0,35) });
  return { payee, amountPaise, uri: 'upi://pay?' + params.toString() };
}
function normalizeReference(reference) {
  const result = typeof reference === 'string' ? reference.trim().toUpperCase() : '';
  if (!/^[A-Z0-9]{6,40}$/.test(result)) fail('Enter the 6-40 character transaction reference shown in your UPI app (letters and numbers only).');
  return result;
}
function referenceKey(payee, reference) {
  return crypto.createHash('sha256').update(payee.toLowerCase() + '|' + normalizeReference(reference)).digest('hex');
}
function claimPatch(order, reference, claimId) {
  checkPayable(order);
  if (!order.manualPayee || !order.lockedAmountPaise) fail('Open the payment instructions before submitting a reference.');
  const normalized = normalizeReference(reference);
  if (order.paymentStatus === 'pending_verification') fail('This payment is already awaiting confirmation. Do not pay again.');
  if (order.lockedAmountPaise !== order.quoteAmountPaise) fail('Your quote changed. Contact the operator.');
  return { paymentStatus: 'pending_verification', manualPayment: { reference: normalized, claimId, amountPaise: order.lockedAmountPaise, payee: order.manualPayee } };
}
function decisionPatch(order, actor, body) {
  if (order.uid === actor.uid) fail('You cannot approve or reject your own payment. Ask another authorized operator.');
  if (!['approve','reject'].includes(body.decision)) fail('Choose approve or reject.');
  if (order.paymentStatus !== 'pending_verification' || !order.manualPayment || body.claimId !== order.manualPayment.claimId) fail('This payment changed or has already been reviewed. Refresh the queue.');
  if (body.decision === 'approve') {
    if (body.receiptChecked !== true) fail('Confirm that you checked receipt in the recipient bank or UPI account.');
    if (body.receivedAmountPaise !== order.manualPayment.amountPaise || order.quoteAmountPaise !== order.manualPayment.amountPaise) fail('The received amount must match the confirmed order total.');
    if (['cancelled','collected'].includes(order.status)) fail('This order needs manual reconciliation before payment approval.');
    return { paymentStatus: 'paid', paymentMethod: 'manual_upi', paymentConfirmedBy: actor.uid, paymentReviewNote: 'Receipt confirmed by recipient/operator' };
  }
  if (typeof body.reason !== 'string' || body.reason.trim().length < 5 || body.reason.length > 300) fail('Give a short reason for rejection (5-300 characters).');
  return { paymentStatus: 'rejected', paymentConfirmedBy: actor.uid, paymentReviewNote: body.reason.trim() };
}
function quotePatch(order, amountPaise) {
  if (order.paymentStatus === 'paid' || order.paymentStatus === 'pending_verification' || order.lockedAmountPaise || order.providerOrderId) fail('The price is locked because payment has started.');
  if (['collected','cancelled'].includes(order.status)) fail('This order is closed.');
  if (!Number.isInteger(amountPaise) || amountPaise < 100 || amountPaise > 5000000) fail('Enter a quote between Rs 1 and Rs 50,000.');
  return { quoteAmountPaise: amountPaise, reviewStatus: 'approved', status: order.status === 'submitted' ? 'accepted' : order.status };
}
function statusPatch(order, next) {
  const allowed = { submitted: ['cancelled'], accepted: ['printing','cancelled'], printing: ['ready'], ready: ['collected'] };
  if (!allowed[order.status]?.includes(next)) fail('That status change is not allowed. Refresh the order.');
  if (next === 'collected' && !['paid','declared_paid'].includes(order.paymentStatus)) fail('Confirm payment before handing over and marking collected.');
  if (next === 'cancelled' && (order.paymentStatus === 'paid' || order.lockedAmountPaise || order.providerOrderId)) fail('Payment has started. Reconcile it before cancelling.');
  return { status: next };
}
module.exports = { isOperator, checkPayable, instructions, normalizeReference, referenceKey, claimPatch, decisionPatch, quotePatch, statusPatch };
