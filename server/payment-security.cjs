const crypto = require('node:crypto');
function validSignature(body, signature, secret) {
  if (!secret || typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(body).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
function assertCaptured(payment, order) {
  if (payment.order_id !== order.providerOrderId || payment.amount !== order.quoteAmountPaise || payment.currency !== 'INR' || payment.status !== 'captured' || payment.captured !== true || payment.amount_refunded > 0) {
    throw Error('Payment is not a matching captured payment.');
  }
}
module.exports = { validSignature, assertCaptured };
