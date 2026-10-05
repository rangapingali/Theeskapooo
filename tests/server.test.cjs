const { test } = require('node:test');
const assert = require('node:assert/strict');
process.env.KITSW_ENABLE_ORDERS = 'false';
const app = require('../server/index.cjs');
test('server serves public dashboard but denies secrets and unconfigured orders/payments', async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    assert.equal((await fetch(base + '/dashboard.html')).status, 200);
    for (const asset of ['/dashboard.js','/dashboard.css','/print-core.js','/order-service.js','/tech-titans.svg','/college-source.html']) assert.equal((await fetch(base + asset)).status, 200);
    for (const privatePath of ['/.env','/.env.example','/server/index.cjs','/SETUP.md','/package.json']) assert.equal((await fetch(base + privatePath)).status, 404);
    const config = await (await fetch(base + '/api/config')).json();
    assert.equal(config.ordersEnabled, false); assert.equal(config.paymentsEnabled, false);
    assert.equal((await fetch(base + '/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 503);
    assert.equal((await fetch(base + '/api/payment-webhook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 503);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
