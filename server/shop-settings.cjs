function shopState(data) { return { acceptingOrders: data?.acceptingOrders !== false }; }
function requireOpen(data) {
  if (!shopState(data).acceptingOrders) throw Object.assign(new Error('The shop is busy and is not accepting new orders. Please try later.'), { httpStatus: 409 });
}
function registerShop(app, { db, isOperator }) {
  app.get('/api/shop', async (req, res) => res.json(shopState((await db.collection('settings').doc('shop').get()).data())));
  app.post('/api/shop', async (req, res) => {
    if (!isOperator(req.student)) throw Object.assign(new Error('Shop operator access required.'), { httpStatus: 403 });
    if (typeof req.body.acceptingOrders !== 'boolean') throw Object.assign(new Error('Choose whether to accept orders.'), { httpStatus: 400 });
    await db.runTransaction(tx => tx.set(db.collection('settings').doc('shop'), { acceptingOrders: req.body.acceptingOrders, updatedBy: req.student.uid, updatedMs: Date.now() }));
    res.json({ acceptingOrders: req.body.acceptingOrders });
  });
}
module.exports = { shopState, requireOpen, registerShop };
