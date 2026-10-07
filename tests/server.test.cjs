const { test } = require('node:test');
const assert = require('node:assert/strict');
process.env.KITSW_ENABLE_ORDERS = 'false';
const app = require('../server/index.cjs');
const { listenOptions } = require('../server/listen-options.cjs');

test('Render accepts requests on all interfaces even if a local HOST value was copied', async () => {
  const options=listenOptions({RENDER:'true',HOST:'localhost',PORT:'0'});
  const server=app.listen(options);
  await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  try {
    assert.equal(server.address().address,'0.0.0.0');
    assert.equal((await fetch('http://127.0.0.1:'+server.address().port+'/healthz')).status,200);
    assert.equal(listenOptions({RENDER:'true',PORT:'10000'}).port,10000);
    assert.equal(listenOptions({NODE_ENV:'production'}).host,'0.0.0.0');
    assert.equal(listenOptions({}).host,'127.0.0.1');
    assert.throws(()=>listenOptions({PORT:'invalid'}),/PORT/);
  } finally {await new Promise(resolve=>server.close(resolve));}
});
test('server serves public dashboard but denies secrets and unconfigured orders/payments', async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    assert.equal((await fetch(base + '/dashboard.html')).status, 200);
    for (const asset of ['/dashboard.js','/dashboard.css','/print-core.js','/order-service.js','/trending.html','/trending.js','/tech-titans.svg','/college-source.html']) assert.equal((await fetch(base + asset)).status, 200);
    for (const privatePath of ['/.env','/.env.example','/server/index.cjs','/SETUP.md','/package.json']) assert.equal((await fetch(base + privatePath)).status, 404);
    const config = await (await fetch(base + '/api/config')).json();
    assert.equal(config.ordersEnabled, false); assert.equal(config.paymentsEnabled, false);
    assert.equal((await fetch(base + '/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 503);
    assert.equal((await fetch(base + '/api/payment-webhook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 503);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
