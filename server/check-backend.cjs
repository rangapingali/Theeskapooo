// Read-only readiness check. Never logs credential contents or access tokens.
const fs = require('node:fs');
const path = require('node:path');
const { initializeApp, applicationDefault, deleteApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { createStore, DATABASE_URL } = require('./realtime-store.cjs');
const { createDocumentStorage } = require('./document-storage.cjs');
const deadline = setTimeout(() => { console.error('Backend check timed out. Check network access and Google API permissions.'); process.exit(1); }, 45000);
deadline.unref();
async function main() {
  const projectId = process.env.FIREBASE_PROJECT_ID || 'theeskapooooo-a04b4';
  const credentials = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const adcPath = process.platform === 'win32' ? path.join(process.env.APPDATA || '', 'gcloud', 'application_default_credentials.json') : path.join(process.env.HOME || '', '.config/gcloud/application_default_credentials.json');
  console.log('Project:', projectId);
  if (!credentials && !fs.existsSync(adcPath)) {
    console.log('NOT READY: No local Firebase Admin credentials configured. Set GOOGLE_APPLICATION_CREDENTIALS to a private local file outside this project, or configure Application Default Credentials.');
    process.exitCode = 1; return;
  }
  if (credentials) {
    if (!fs.existsSync(credentials)) { console.log('NOT READY: Configured credential file is missing.'); process.exitCode = 1; return; }
    const info = JSON.parse(fs.readFileSync(credentials, 'utf8'));
    if (info.project_id && info.project_id !== projectId) { console.log('NOT READY: Credential project does not match this app.'); process.exitCode = 1; return; }
  }
  const app = initializeApp({ credential: applicationDefault(), projectId, storageBucket: process.env.FIREBASE_STORAGE_BUCKET || projectId + '.firebasestorage.app' });
  const db = createStore({ credential: applicationDefault(), databaseURL: process.env.FIREBASE_DATABASE_URL || DATABASE_URL });
  let failed = false;
  const checks = [
    ['Singapore Realtime Database access', () => db.collection('orders').limit(1).get()],
    ['Supabase private storage access', () => createDocumentStorage().check()],
    ...String(process.env.PRINT_OPERATOR_EMAILS || '').split(',').map(email => email.trim()).filter(Boolean).map(email => ['Verified operator account ' + email, async () => { const user = await getAuth(app).getUserByEmail(email); if (!user.emailVerified || user.disabled) throw { code: 'operator-not-verified-or-disabled' }; }])
  ];
  for (const [label, check] of checks) {
    try { await check(); console.log('PASS:', label); }
    catch (error) {
      failed = true;
      const code = String(error.code || 'connection-or-permission-error');
      const hint = label.startsWith('Firestore') && code === '5' ? 'Create the default Firestore database in Firebase Console.' : label.startsWith('Storage') && code === '404' ? 'Create the Firebase Storage bucket in Firebase Console.' : ['403','7'].includes(code) ? 'Check service-account permissions and, for Storage, project billing.' : code === 'auth/user-not-found' ? 'Register this college email in the app first.' : '';
      console.log('NOT READY:', label, /^[a-z0-9/_-]+$/i.test(code) ? '(' + code + ')' : '(connection-or-permission-error)', hint);
    }
  }
  console.log('Realtime Database rules must be deployed and Supabase must use a private bucket without browser write policies before enabling orders.');
  await deleteApp(app);
  process.exitCode = failed ? 1 : 0;
}
main().catch(() => { console.error('Backend check failed. Verify server credential setup.'); process.exitCode = 1; }).finally(() => clearTimeout(deadline));
