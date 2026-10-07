const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const registerTrendingPrints = require('../server/trending-prints.cjs');
const { resolveTrendingPrints } = require('../server/trending-print-pricing.cjs');

function database() {
  const records = new Map();
  const collection = name => ({
    doc(id) {
      const path = name + '/' + id;
      return { id, path, get: async () => snapshot(id, records.get(path)) };
    },
    async get() {
      return { docs: [...records].filter(([path]) => path.startsWith(name + '/') && path.split('/').length === 2).map(([path, data]) => snapshot(path.split('/')[1], data)) };
    }
  });
  const snapshot = (id, data) => ({ id, exists: data !== undefined, data: () => data && structuredClone(data) });
  return {
    collection,
    async runTransaction(callback) {
      const pending = [];
      const tx = {
        get: async ref => snapshot(ref.id, records.get(ref.path)),
        create: (ref, value) => pending.push(() => { if (records.has(ref.path)) throw Error('Record already exists'); records.set(ref.path, structuredClone(value)); }),
        set: (ref, value) => pending.push(() => records.set(ref.path, structuredClone(value))),
        update: (ref, value) => pending.push(() => { if (!records.has(ref.path)) throw Error('Record not found'); records.set(ref.path, { ...records.get(ref.path), ...value }); })
      };
      const result = await callback(tx);
      pending.forEach(commit => commit());
      return result;
    }
  };
}

test('trending print titles and prices are validated in paise', () => {
  const { validatePrint } = registerTrendingPrints;
  assert.deepEqual(validatePrint({ title: ' T&P Form ', price: 6.25 }), { title: 'T&P Form', pricePaise: 625 });
  for (const body of [
    { title: '  ', price: 2 },
    { title: 'Valid', price: 0 },
    { title: 'Valid', price: 1.001 },
    { title: 'Valid', price: 50001 },
    { title: 'x'.repeat(101), price: 2 }
  ]) assert.throws(() => validatePrint(body), { httpStatus: 400 });
});

test('trending print management is operator-only and student catalog hides removed items', async () => {
  const db = database(), app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.student = { uid: req.get('x-user') || 'student' }; next(); });
  registerTrendingPrints(app, { db, isOperator: token => token.uid === 'shop' });
  app.use((error, req, res, next) => res.status(error.httpStatus || 500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + '/api';
  const send = async (method, path, body, user = 'shop') => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-User': user }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  };
  try {
    assert.deepEqual((await (await fetch(base + '/trending-prints')).json()).prints, []);
    assert.equal((await send('POST', '/operator/trending-prints', { title: 'T&P Training', price: 5 }, 'student')).status, 403);
    const added = await send('POST', '/operator/trending-prints', { title: 'T&P Training', price: 5 });
    assert.equal(added.status, 201);
    assert.equal(added.data.print.pricePaise, 500);
    const id = added.data.print.id;
    assert.equal((await send('PUT', '/operator/trending-prints/' + id, { title: 'Placement form', price: 7.5 })).data.print.title, 'Placement form');
    const visible = await (await fetch(base + '/trending-prints')).json();
    assert.deepEqual(visible.prints.map(item => item.title), ['Placement form']);
    assert.equal((await send('DELETE', '/operator/trending-prints/' + id)).status, 200);
    assert.deepEqual((await (await fetch(base + '/trending-prints')).json()).prints, []);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('orders use the active catalog title and price, never client-supplied catalog data', async () => {
  const db = database(), ref = db.collection('trendingPrints').doc('known-id');
  await db.runTransaction(tx => tx.create(ref, { title: 'T&P Training', pricePaise: 625, active: true }));
  const result = await resolveTrendingPrints({ get: dbRef => db.runTransaction(tx => tx.get(dbRef)) }, db, ['known-id']);
  assert.equal(result.totalPaise, 625);
  assert.deepEqual(result.prints, [{ id: 'known-id', title: 'T&P Training', pricePaise: 625 }]);
  await assert.rejects(resolveTrendingPrints({ get: dbRef => db.runTransaction(tx => tx.get(dbRef)) }, db, ['missing-id']), { httpStatus: 409 });
});

test('students can place a self-declared quick-print order without an upload session', async () => {
  const { randomUUID } = require('node:crypto');
  const db = database(), app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.student = { uid: 'student', email: 'student@kitsw.ac.in' }; next(); });
  const trendingId = randomUUID();
  await db.runTransaction(tx => tx.create(db.collection('trendingPrints').doc(trendingId), { title: 'T&P training form', pricePaise: 625, active: true }));
  const paymentConfig = { mode: 'self_declared', enabled: true, ordersCollection: 'orders', quotaCollection: 'quotas' };
  const deps = { db, bucket: {}, paymentConfig, publicOrder: snapshot => ({ id: snapshot.id, ...snapshot.data() }), FieldValue: { serverTimestamp: () => Date.now() }, env: { MERCHANT_UPI_REFERENCE: 'shop@bank', MERCHANT_UPI_ACCOUNT_NAME: 'Shop' } };
  require('../server/payment-drafts.cjs')(app, deps);
  require('../server/order-routes.cjs')(app, deps);
  app.use((error, req, res, next) => res.status(error.httpStatus || 500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + '/api';
  const body = { id: randomUUID(), shop: 'campus', notes: '', pickupTime: null, paymentPreference: 'online', priority: false, files: [], trendingPrintIds: [trendingId], trendingPrints: [{ id: trendingId, title: 'Forged title', pricePaise: 1 }] };
  const post = async (path, payload) => {
    const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    return { status: response.status, data: await response.json() };
  };
  try {
    const draft = await post('/payment-drafts', body);
    assert.equal(draft.status, 200, JSON.stringify(draft));
    assert.equal(draft.data.amountPaise, 625);
    const placed = await post('/orders', { ...body, paymentDeclared: true });
    assert.equal(placed.status, 201, JSON.stringify(placed));
    assert.equal(placed.data.order.quoteAmountPaise, 625);
    assert.equal(placed.data.order.paymentStatus, 'declared_paid');
    assert.deepEqual(placed.data.order.trendingPrints, [{ id: trendingId, title: 'T&P training form', pricePaise: 625 }]);
    assert.deepEqual(placed.data.order.files, []);
    assert.ok(Number.isFinite(placed.data.order.paymentReceivedMs));
    const repriced = { ...body, id: randomUUID(), trendingPrints: [] };
    const repricedDraft = await post('/payment-drafts', repriced);
    assert.equal(repricedDraft.data.amountPaise, 625);
    await db.runTransaction(tx => tx.update(db.collection('trendingPrints').doc(trendingId), { title: 'Updated T&P form', pricePaise: 700 }));
    const repricedOrder = await post('/orders', { ...repriced, paymentDeclared: true });
    assert.equal(repricedOrder.status, 201, JSON.stringify(repricedOrder));
    assert.equal(repricedOrder.data.order.quoteAmountPaise, 625);
    assert.equal(repricedOrder.data.order.trendingPrints[0].title, 'T&P training form');
  } finally { await new Promise(resolve => server.close(resolve)); }
});
