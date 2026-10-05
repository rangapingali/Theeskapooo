// Merge only lookup indexes; preserve the deployed authorization rules.
const { applicationDefault } = require('firebase-admin/app');
const { DATABASE_URL } = require('./realtime-store.cjs');
(async () => {
  const { access_token } = await applicationDefault().getAccessToken();
  const base = (process.env.FIREBASE_DATABASE_URL || DATABASE_URL).replace(/\/$/, '');
  const headers = { Authorization: 'Bearer ' + access_token, 'Content-Type': 'application/json' };
  const current = await fetch(base + '/.settings/rules.json', { headers, signal: AbortSignal.timeout(20000) });
  if (!current.ok) throw Error('Could not read database rules (HTTP ' + current.status + ').');
  const rules = await current.json();
  if (rules.rules?.['.read'] !== false || rules.rules?.['.write'] !== false) throw Error('Unexpected database authorization rules; review before changing indexes.');
  const app = rules.rules.kitswApp ||= {};
  for (const collection of ['orders','testOrders']) {
    const node = app[collection] ||= {};
    const existing = node['.indexOn'] || [];
    node['.indexOn'] = [...new Set([...(Array.isArray(existing) ? existing : [existing]), 'uid', 'createdAt'])];
  }
  const saved = await fetch(base + '/.settings/rules.json', { method: 'PUT', headers, body: JSON.stringify(rules), signal: AbortSignal.timeout(20000) });
  if (!saved.ok) throw Error('Index update failed (HTTP ' + saved.status + ').');
  const verified = await fetch(base + '/kitswApp/orders.json?' + new URLSearchParams({ orderBy: JSON.stringify('uid'), equalTo: JSON.stringify('__index_probe_no_person__') }), { headers, signal: AbortSignal.timeout(20000) });
  if (!verified.ok) throw Error('Index query check failed (HTTP ' + verified.status + ').');
  console.log('Order indexes deployed and queried successfully; database authorization rules preserved.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
