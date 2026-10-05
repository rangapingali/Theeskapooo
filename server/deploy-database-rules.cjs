const fs = require('node:fs');
const path = require('node:path');
const { applicationDefault } = require('firebase-admin/app');
const { DATABASE_URL } = require('./realtime-store.cjs');
(async () => {
  const base = process.env.FIREBASE_DATABASE_URL || DATABASE_URL;
  const token = await applicationDefault().getAccessToken();
  const headers = { Authorization: 'Bearer ' + token.access_token, 'Content-Type': 'application/json' };
  const url = base + '/.settings/rules.json';
  const existing = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
  if (!existing.ok) throw new Error('Cannot inspect existing rules: ' + existing.status);
  const text = await existing.text();
  // Do not overwrite custom rules or unrelated application rules.
  const rules = JSON.parse(text.replace(/\/\/[^\r\n]*/g, '').replace(/,\s*([}\]])/g, '$1')).rules;
  if (Object.keys(rules).some(k => !['.read', '.write'].includes(k)) || ![rules['.read'], rules['.write']].every(v => v === false || v === 'now < 1793557800000')) throw new Error('Custom rules detected. Review before deploying.');
  const body = fs.readFileSync(path.join(__dirname, '..', 'database.rules.json'), 'utf8');
  const result = await fetch(url, { method: 'PUT', headers, body, signal: AbortSignal.timeout(20000) });
  if (!result.ok) throw new Error('Rules deployment failed: ' + result.status);
  const verify = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
  if (!verify.ok || JSON.stringify(await verify.json()) !== JSON.stringify(JSON.parse(body))) throw new Error('Rules verification failed');
  const anonymous = await fetch(base + '/kitswApp.json', { signal: AbortSignal.timeout(20000) });
  if (![401, 403].includes(anonymous.status)) throw new Error('Anonymous access was not denied');
  console.log('Deployed server-only Realtime Database rules; anonymous access denied. No order data changed.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
