const { randomUUID } = require('node:crypto');
const { createDocumentStorage } = require('./document-storage.cjs');
(async () => {
  const storage = createDocumentStorage(); await storage.check();
  const path = 'connection-checks/' + randomUUID() + '.pdf';
  const pdf = await require('pdf-lib').PDFDocument.create();
  for (let i = 0; i < 3; i++) pdf.addPage();
  const bytes = Buffer.from(await pdf.save());
  if (await require('./document-inspection.cjs').inspectDocument(bytes, 'test.pdf') !== 3) throw Error('page-count-mismatch');
  try {
    const meta = await storage.upload(path, bytes);
    await storage.upload(path, bytes);
    const chunks = [];
    for await (const chunk of storage.file(path, { generation: meta.generation }).createReadStream()) chunks.push(chunk);
    if (!Buffer.concat(chunks).equals(bytes)) throw Error('download-mismatch');
    const base = process.env.SUPABASE_URL + '/storage/v1/object/';
    for (const route of ['public/', 'authenticated/']) {
      const response = await fetch(base + route + (process.env.SUPABASE_BUCKET || 'print-documents') + '/' + path, { signal: AbortSignal.timeout(15000) });
      if (response.ok || ![400, 401, 403, 404].includes(response.status)) throw Error('anonymous-access-check-failed');
    }
    console.log('PASS: three-page PDF inspected, real upload, immutable retry, version-checked download and anonymous download denial.');
  } finally { await storage.remove([path]); console.log('Connection test document deleted.'); }
})().catch(() => { console.error('Storage transfer verification failed. Live orders should remain disabled.'); process.exitCode = 1; });
