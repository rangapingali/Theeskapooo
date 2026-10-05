const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { registerShop, requireOpen } = require('../server/shop-settings.cjs');
test('only an operator can pause new orders; students can read busy state; admission rejects busy state', async () => {
  let state;
  const db = { collection: () => ({ doc: () => ({ get: async () => ({ data: () => state }) }) }), runTransaction: async fn => fn({ set: (ref, value) => { state = value; } }) };
  const app = express(); app.use(express.json()); app.use((req, res, next) => { req.student = { uid: req.get('x-user') || 'student' }; next(); });
  registerShop(app, { db, isOperator: token => token.uid === 'operator' });
  app.use((err, req, res, next) => res.status(err.httpStatus || 500).json({ error: err.message }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  const url = `http://127.0.0.1:${server.address().port}/api/shop`;
  const post = (user, acceptingOrders) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-User': user }, body: JSON.stringify({ acceptingOrders }) });
  try {
    assert.equal((await (await fetch(url)).json()).acceptingOrders, true);
    assert.equal((await post('student', false)).status, 403);
    assert.equal((await post('operator', 'false')).status, 400);
    assert.equal((await post('operator', false)).status, 200);
    assert.equal((await (await fetch(url)).json()).acceptingOrders, false);
    assert.throws(() => requireOpen(state), /busy/);
    await post('operator', true); assert.doesNotThrow(() => requireOpen(state));
  } finally { await new Promise(r => server.close(r)); }
});
