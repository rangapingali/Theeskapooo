const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const crypto = require('node:crypto');
const register = require('../server/manual-routes.cjs');
function database() {
  const data = new Map();
  const ref = path => ({ path, id: path.split('/').pop(), collection: name => collection(path + '/' + name), get: async () => snap(path) });
  const snap = path => ({ exists: data.has(path), id: path.split('/').pop(), data: () => data.get(path) });
  const collection = path => ({ doc: id => ref(path + '/' + (id || crypto.randomUUID())) });
  return { data, collection, async runTransaction(fn) {
    const writes = []; let writing = false;
    await fn({ get: async r => { assert.equal(writing, false, 'Firestore reads must precede writes'); return snap(r.path); }, update: (r, v) => { writing = true; writes.push(() => data.set(r.path, { ...data.get(r.path), ...v })); }, set: (r, v) => { writing = true; writes.push(() => data.set(r.path, v)); }, create: (r, v) => { writing = true; writes.push(() => { assert.equal(data.has(r.path), false); data.set(r.path, v); }); } });
    writes.forEach(write => write());
  } };
}
test('manual API enforces ownership, operator approval, pending status, idempotency and reference uniqueness', async () => {
  const db = database(); const app = express(); app.use(express.json());
  const removedDocuments = [];
  app.use((req, res, next) => { const uid = req.get('x-test-user') || 'student1'; req.student = { uid, email: uid + '@kitsw.ac.in', email_verified: true }; next(); });
  register(app, { db, bucket: { remove: async paths => removedDocuments.push(...paths) }, FieldValue: { serverTimestamp: () => 'timestamp' }, publicOrder: s => ({ id: s.id, ...s.data() }), paymentConfig: { mode: 'manual', enabled: true, ordersCollection: 'orders' }, env: { PRINT_OPERATOR_EMAILS: 'operator@kitsw.ac.in', MERCHANT_UPI_REFERENCE: 'example@fam', MERCHANT_UPI_ACCOUNT_NAME: 'Example' } });
  app.use((error, req, res, next) => res.status(error.httpStatus || 500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const id = crypto.randomUUID(), otherId = crypto.randomUUID();
  const order = { uid: 'student1', status: 'ready', paymentStatus: 'unpaid', reviewStatus: 'approved', quoteAmountPaise: 6000 };
  db.data.set('orders/' + id, { ...order }); db.data.set('orders/' + otherId, { ...order });
  async function post(route, body = {}, actor = 'student1') { const response = await fetch(base + '/api/' + route, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-test-user': actor }, body: JSON.stringify(body) }); return { status: response.status, data: await response.json() }; }
  try {
    assert.equal((await post(`orders/${id}/manual-instructions`, {}, 'intruder')).status, 404);
    const instructions = await post(`orders/${id}/manual-instructions`);
    assert.equal(instructions.status, 200); assert.match(instructions.data.qr, /^data:image\/png;base64,/); assert.equal(instructions.data.verifiedByBank, false);
    const claim = await post(`orders/${id}/manual-payment`, { reference: '123456789012', paymentStatus: 'paid' });
    assert.equal(claim.data.status, 'pending_verification'); assert.equal(db.data.get('orders/' + id).paymentStatus, 'pending_verification');
    assert.equal((await post(`orders/${id}/manual-payment`, { reference: '123456789012' })).status, 200);
    assert.equal(db.data.get('orders/' + id).manualAttempts, 1);
    const body = { decision: 'approve', claimId: db.data.get('orders/' + id).manualPayment.claimId, receivedAmountPaise: 6000, receiptChecked: true };
    assert.equal((await post(`operator/orders/${id}/payment-review`, body)).status, 403);
    assert.equal((await post(`operator/orders/${id}/payment-review`, body, 'operator')).status, 200);
    assert.equal(db.data.get('orders/' + id).paymentStatus, 'paid');
    assert.equal((await post(`operator/orders/${id}/payment-review`, body, 'operator')).status, 409);
    await post(`orders/${otherId}/manual-instructions`); await post(`orders/${otherId}/manual-payment`, { reference: '123456789012' });
    const duplicate = await post(`operator/orders/${otherId}/payment-review`, { ...body, claimId: db.data.get('orders/' + otherId).manualPayment.claimId }, 'operator');
    assert.equal(duplicate.status, 409); assert.equal(db.data.get('orders/' + otherId).paymentStatus, 'pending_verification');
    assert.ok([...db.data.keys()].some(key => key.includes('/audit/')));
    const cashId = crypto.randomUUID();
    db.data.set('orders/' + cashId, { ...order, lockedAmountPaise: 6000 });
    const cash = { amountPaise: 6000, receiptChecked: true };
    assert.equal((await post(`operator/orders/${cashId}/cash`, cash, 'operator')).status, 409);
    assert.equal((await post(`operator/orders/${cashId}/cash`, { ...cash, noUpiReceived: true }, 'operator')).status, 200);
    assert.equal(db.data.get('orders/' + cashId).paymentMethod, 'cash');
    const offlineId = crypto.randomUUID();
    db.data.set('orders/' + offlineId, { uid: 'student1', status: 'accepted', paymentStatus: 'unpaid', paymentPreference: 'offline', offlineNumber: 17, reviewStatus: 'approved', quoteAmountPaise: 500, files: [] });
    assert.equal((await post(`operator/orders/${offlineId}/cash`, { amountPaise: 500, receiptChecked: true }, 'operator')).status, 409);
    assert.equal((await post(`operator/orders/${offlineId}/cash`, { amountPaise: 500, receiptChecked: true, studentPresent: true }, 'operator')).status, 200);
    assert.equal((await post(`operator/orders/${offlineId}/status`, { status: 'printing' }, 'operator')).status, 409);
    assert.equal((await post(`operator/orders/${offlineId}/status`, { status: 'printing', studentPresent: true }, 'operator')).status, 200);
    const legacyId = crypto.randomUUID();
    db.data.set('orders/' + legacyId, { uid: 'student1', status: 'accepted', paymentStatus: 'declared_paid' });
    const legacyPrinting = await post(`operator/orders/${legacyId}/status`, { status: 'printing' }, 'operator');
    assert.equal(legacyPrinting.status, 200);
    assert.equal(legacyPrinting.data.order.status, 'printing');
    const collectedId = crypto.randomUUID();
    db.data.set('orders/' + collectedId, { uid: 'student1', status: 'ready', paymentStatus: 'declared_paid', quoteAmountPaise: 6000, files: [{ path: 'private/handed-over.pdf' }] });
    db.data.set('uploadSessions/' + collectedId, { state: 'ordered', collection: 'orders', files: { one: { path: 'private/handed-over.pdf' } } });
    const handedOver = await post(`operator/orders/${collectedId}/status`, { status: 'collected' }, 'operator');
    assert.equal(handedOver.status, 200);
    assert.equal(handedOver.data.order.documentsDeleted, true);
    assert.equal(db.data.get('orders/' + collectedId).status, 'collected');
    assert.equal(db.data.get('uploadSessions/' + collectedId).state, 'deleted');
    assert.deepEqual(removedDocuments, ['private/handed-over.pdf']);
    assert.equal((await fetch(`${base}/api/operator/orders/${collectedId}/files/0`, { headers: { 'x-test-user': 'operator' } })).status, 410);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
