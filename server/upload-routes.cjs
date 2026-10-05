const express = require('express');
const core = require('../print-core.js');
const { idPattern } = require('./order-validation.cjs');
module.exports = function registerUploads(app, { db, bucket, inspectDocument = require('./document-inspection.cjs').inspectDocument }) {
  const fail = (status, message) => Object.assign(new Error(message), { httpStatus: status });
  app.post('/api/uploads/:orderId/:fileId', (req, res, next) => {
    if (!idPattern.test(req.params.orderId) || !idPattern.test(req.params.fileId)) return next(fail(400, 'Invalid upload identifier.'));
    const size = Number(req.get('x-file-size')), name = req.query.name;
    if (typeof name !== 'string' || name.length > 240 || !Number.isInteger(size) || core.fileError({ name, size })) return next(fail(400, 'Choose a supported document up to 25 MB.'));
    req.document = { name, size, path: `student-uploads/${req.student.uid}/${req.params.orderId}/${req.params.fileId}.${name.split('.').pop().toLowerCase()}` };
    next();
  }, express.raw({ type: 'application/octet-stream', limit: '25mb' }), async (req, res) => {
    const file = req.document;
    if (!Buffer.isBuffer(req.body) || req.body.length !== file.size) throw fail(400, 'Upload size does not match the document.');
    const session = db.collection('uploadSessions').doc(req.params.orderId);
    const quota = db.collection('uploadQuotas').doc(req.student.uid + '-' + new Date().toISOString().slice(0, 10));
    await db.runTransaction(async tx => {
      require('./shop-settings.cjs').requireOpen((await tx.get(db.collection('settings').doc('shop'))).data());
      const s = (await tx.get(session)).data();
      if (s && (s.uid !== req.student.uid || s.state !== 'open' || Date.now() - s.createdMs >= 48 * 3600000)) throw fail(409, 'This upload session is closed. Start a new order.');
      const files = s?.files || {};
      if (files[req.params.fileId] && ['name', 'size', 'path'].some(k => files[req.params.fileId][k] !== file[k])) throw fail(409, 'Document changed. Start a new order.');
      files[req.params.fileId] = file;
      if (Object.keys(files).length > 10 || Object.values(files).reduce((n, f) => n + f.size, 0) > 100 * 1024 * 1024) throw fail(400, 'An order allows 10 files and 100 MB total.');
      if (!s) {
        const count = (await tx.get(quota)).data()?.count || 0;
        if (count >= 30) throw fail(429, 'Daily upload limit reached.');
        tx.set(quota, { count: count + 1 });
      }
      tx.set(session, { uid: req.student.uid, state: 'open', createdMs: s?.createdMs || Date.now(), files });
    });
    const pages = await inspectDocument(req.body, file.name);
    await bucket.upload(file.path, req.body);
    await db.runTransaction(async tx => {
      const latest = (await tx.get(session)).data();
      if (latest?.state !== 'open' || latest.uid !== req.student.uid) throw fail(409, 'Upload session closed. Refresh your order.');
      tx.set(session, { ...latest, files: { ...latest.files, [req.params.fileId]: { ...file, pages, pageCountSource: pages === null ? 'manual' : 'automatic' } } });
    });
    const current = (await session.get()).data();
    if (current.state !== 'open') { if (current.state === 'deleting' || current.state === 'deleted') await bucket.remove([file.path]); throw fail(409, 'Upload session closed. Refresh your order.'); }
    res.status(201).json({ path: file.path, pages, pageCountSource: pages === null ? 'manual' : 'automatic' });
  });
};
