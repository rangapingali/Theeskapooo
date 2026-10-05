// Read security configuration only; never prints application data or credentials.
const { applicationDefault } = require('firebase-admin/app');
const { DATABASE_URL } = require('./realtime-store.cjs');
(async () => {
  const token = await applicationDefault().getAccessToken();
  const response = await fetch((process.env.FIREBASE_DATABASE_URL || DATABASE_URL) + '/.settings/rules.json', { headers: { Authorization: 'Bearer ' + token.access_token }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('Rules inspection failed: HTTP ' + response.status);
  console.log(await response.text());
})().catch(error => { console.error(error.message); process.exitCode = 1; });
