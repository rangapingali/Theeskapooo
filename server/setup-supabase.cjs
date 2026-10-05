const { createDocumentStorage } = require('./document-storage.cjs');
(async () => {
  await createDocumentStorage().setup();
  console.log('Supabase print-documents bucket is private and limited to 25 MB per file.');
})().catch(error => { console.error(error.code === 'supabase-not-configured' ? error.message : 'Supabase setup failed. Check the server secret key and private bucket settings.'); process.exitCode = 1; });
