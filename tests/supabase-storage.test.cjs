const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createDocumentStorage } = require('../server/document-storage.cjs');
test('Supabase keeps uploads immutable, checks private bucket and pins downloads', async () => {
  const objects = new Map();
  const api = {
    upload: async (path, bytes, options) => {
      assert.equal(options.upsert, false);
      if (objects.has(path)) return { error: { statusCode: 409 } };
      objects.set(path, bytes); return { data: {} };
    },
    info: async path => ({ data: { id: 'id', version: 'date', size: objects.get(path).length, contentType: 'application/octet-stream' } }),
    download: async path => ({ data: new Blob([objects.get(path)]) }),
    remove: async paths => { paths.forEach(p => objects.delete(p)); return { data: [] }; }
  };
  let isPublic = false;
  const storage = createDocumentStorage({}, { storage: { from: () => api, getBucket: async () => ({ data: { public: isPublic, file_size_limit: 25 * 1024 * 1024 } }) } });
  await storage.check(); isPublic = true; await assert.rejects(storage.check());
  await storage.upload('document', Buffer.from('original'));
  await storage.upload('document', Buffer.from('original'));
  await assert.rejects(storage.upload('document', Buffer.from('modified')));
  const chunks = [];
  for await (const chunk of storage.file('document', { generation: 'id:date' }).createReadStream()) chunks.push(chunk);
  assert.equal(Buffer.concat(chunks).toString(), 'original');
  await assert.rejects(async () => { for await (const chunk of storage.file('document', { generation: 'other' }).createReadStream()) {} });
  await storage.remove(['document']); assert.equal(objects.size, 0);
});
