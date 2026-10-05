const { applicationDefault } = require('firebase-admin/app');
const { createStore, DATABASE_URL } = require('./realtime-store.cjs');
const { createDocumentStorage } = require('./document-storage.cjs');
const { cleanupDocuments } = require('./document-cleanup.cjs');
(async () => {
  await cleanupDocuments({ db: createStore({ credential: applicationDefault(), databaseURL: process.env.FIREBASE_DATABASE_URL || DATABASE_URL }), bucket: createDocumentStorage() });
  console.log('Document retention cleanup completed.');
})().catch(() => { console.error('Cleanup failed; verify credentials and retry.'); process.exitCode = 1; });
