const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { randomUUID } = require('node:crypto');
const register = require('../server/upload-routes.cjs');
test('uploads enforce session ownership, body size, expiry and closed-order protection', async () => {
  const records = new Map(); let writes = 0;
  const db = { collection: name => ({ doc: id => ({ path: name + '/' + id, get: async () => ({ data: () => structuredClone(records.get(name + '/' + id)) }) }) }), runTransaction: async fn => fn({ get: async ref => ref.get(), set: (ref, value) => records.set(ref.path, structuredClone(value)) }) };
  const app = express();
  app.use((req, res, next) => { req.student = { uid: req.get('x-user') || 'student' }; next(); });
  register(app, { db, inspectDocument: async () => 1, bucket: { upload: async () => { writes++; }, remove: async () => {} } });
  app.use((error, req, res, next) => res.status(error.httpStatus || 500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const order = randomUUID(), file = randomUUID();
  const url = `http://127.0.0.1:${server.address().port}/api/uploads/${order}/${file}?name=notes.pdf`;
  const send = (uid = 'student', size = 3) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-File-Size': String(size), 'X-User': uid }, body: Buffer.from('pdf') });
  try {
    assert.equal((await send('student', 4)).status, 400);
    assert.equal((await send()).status, 201);
    assert.equal((await send()).status, 201);
    assert.equal((await send('other')).status, 409);
    records.get('uploadSessions/' + order).state = 'ordered';
    assert.equal((await send()).status, 409);
    records.get('uploadSessions/' + order).state = 'open';
    records.get('uploadSessions/' + order).createdMs = Date.now() - 49 * 3600000;
    assert.equal((await send()).status, 409);
    assert.equal(writes, 2);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
