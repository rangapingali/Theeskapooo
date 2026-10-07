const crypto = require('node:crypto');
const { idPattern } = require('./order-validation.cjs');

function failure(status, message) { return Object.assign(new Error(message), { httpStatus: status }); }
function validatePrint(body) {
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const price = typeof body?.price === 'number' ? body.price : Number(body?.price);
  const pricePaise = Math.round(price * 100);
  if (!title || title.length > 100) throw failure(400, 'Enter a title between 1 and 100 characters.');
  if (!Number.isFinite(price) || !Number.isSafeInteger(pricePaise) || Math.abs(price * 100 - pricePaise) > 1e-7 || pricePaise < 100 || pricePaise > 5000000) throw failure(400, 'Enter a price between Rs 1 and Rs 50,000, with up to two decimal places.');
  return { title, pricePaise };
}
function publicPrint(snapshot) {
  const item = snapshot.data();
  return { id: snapshot.id, title: item.title, pricePaise: item.pricePaise };
}
module.exports = function registerTrendingPrints(app, { db, isOperator }) {
  const collection = () => db.collection('trendingPrints');
  app.get('/api/trending-prints', async (req, res) => {
    const result = await collection().get();
    res.json({ prints: result.docs.filter(snapshot => snapshot.data().active === true).map(publicPrint) });
  });
  app.post('/api/operator/trending-prints', async (req, res) => {
    if (!isOperator(req.student)) throw failure(403, 'Shop operator access required.');
    const item = validatePrint(req.body);
    const ref = collection().doc(crypto.randomUUID());
    await db.runTransaction(tx => tx.create(ref, { ...item, active: true, createdMs: Date.now() }));
    res.status(201).json({ print: publicPrint(await ref.get()) });
  });
  app.put('/api/operator/trending-prints/:id', async (req, res) => {
    if (!idPattern.test(req.params.id || '')) throw failure(404, 'Trending print not found.');
    if (!isOperator(req.student)) throw failure(403, 'Shop operator access required.');
    const ref = collection().doc(req.params.id);
    const item = validatePrint(req.body);
    let updated;
    await db.runTransaction(async tx => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists || snapshot.data().active !== true) throw failure(404, 'Trending print not found.');
      tx.update(ref, { ...item, updatedMs: Date.now() });
      updated = { id: ref.id, ...item };
    });
    res.json({ print: updated });
  });
  app.delete('/api/operator/trending-prints/:id', async (req, res) => {
    if (!idPattern.test(req.params.id || '')) throw failure(404, 'Trending print not found.');
    if (!isOperator(req.student)) throw failure(403, 'Shop operator access required.');
    const ref = collection().doc(req.params.id);
    await db.runTransaction(async tx => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists || snapshot.data().active !== true) throw failure(404, 'Trending print not found.');
      tx.update(ref, { active: false, updatedMs: Date.now() });
    });
    res.json({ ok: true });
  });
};
module.exports.validatePrint = validatePrint;
