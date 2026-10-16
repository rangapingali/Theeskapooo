const crypto = require('node:crypto');
function validSignature(body, signature, secret) {
  if (!secret || typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(body).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
function assertCaptured(payment, order) {
  if (!payment || !order || !/^order_[a-zA-Z0-9]+$/.test(order.providerOrderId || '') || !Number.isSafeInteger(order.quoteAmountPaise) || order.quoteAmountPaise < 100 || !Number.isSafeInteger(payment.amount) || !Number.isSafeInteger(payment.amount_refunded) || payment.amount_refunded !== 0 || payment.order_id !== order.providerOrderId || payment.amount !== order.quoteAmountPaise || payment.currency !== 'INR' || payment.status !== 'captured' || payment.captured !== true || payment.amount_refunded > 0) {
    throw Error('Payment is not a matching captured payment.');
  }
}
function requireVerifiedPrintPayment(order,mode) {
  if (!['live','test'].includes(mode)) return;
  const cash = order?.paymentStatus === 'paid' && order.paymentMethod === 'cash' && !!order.paymentConfirmedBy;
  const gateway = order?.paymentStatus === 'paid' && order.paymentVerification === 'gateway_api' && /^pay_[a-zA-Z0-9]+$/.test(order.paymentId||'');
  if ((!cash && !gateway) || order?.paymentReconciliationRequired) throw Object.assign(Error('Verified payment is required before printing. Student declarations and screenshots are not accepted in gateway mode.'),{httpStatus:409});
}
module.exports = { validSignature, assertCaptured, requireVerifiedPrintPayment };
