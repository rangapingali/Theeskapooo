const { validateOrder } = require('./order-validation.cjs');
module.exports = function registerOrders(app, { db, bucket, paymentConfig, publicOrder, FieldValue }) {
const failure = (httpStatus, message) => Object.assign(new Error(message), { httpStatus });
app.get('/api/orders', async (req, res) => {
  const snapshots = await db.collection(paymentConfig.ordersCollection).where('uid', '==', req.student.uid).orderBy('createdAt', 'desc').limit(100).get();
  res.json({ orders: snapshots.docs.map(publicOrder) });
});
app.post('/api/orders', async (req, res) => {
  let input; try { input = validateOrder(req.body, req.student.uid); } catch (error) { throw failure(400, error.message); }
  const ref = db.collection(paymentConfig.ordersCollection).doc(input.id);
  const existing = await ref.get();
  if (existing.exists) {
    if (existing.data().uid !== req.student.uid) throw failure(409, 'Please start a new order.');
    return res.json({ order: publicOrder(existing) });
  }
  const declarationMode = paymentConfig.mode === 'self_declared';
  const requestHash = require('./payment-drafts.cjs').fingerprint(input);
  if (declarationMode && (!paymentConfig.enabled || req.body.paymentDeclared !== true || input.paymentPreference !== 'online')) throw failure(400, 'Complete payment and select the confirmation checkbox before placing the order.');
  if (input.estimate.needsQuote) throw failure(400, 'Only fixed-price options are available. Please choose no binding.');
  const fixedAmount = Math.round(input.estimate.amount * 100);
  if (!Number.isSafeInteger(fixedAmount) || fixedAmount <= 0 || fixedAmount > 5000000) throw failure(400, 'Order total must be between Rs 1 and Rs 50,000.');
  for (const file of input.files) {
    let meta; try { [meta] = await bucket.file(file.path).getMetadata(); } catch { throw failure(400, 'A document upload is missing. Please upload it again.'); }
    if (Number(meta.size) !== file.size || meta.contentType !== 'application/octet-stream') throw failure(400, 'Uploaded document does not match the order.');
    file.generation = meta.generation;
  }
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()).replaceAll('/', '-');
  const quota = db.collection(paymentConfig.quotaCollection).doc(req.student.uid + '-' + day);
  await db.runTransaction(async tx => {
    const [saved, count] = await Promise.all([tx.get(ref), tx.get(quota)]);
    if (saved.exists) { if (saved.data().uid !== req.student.uid) throw failure(409, 'Please start a new order.'); return; }
    require('./shop-settings.cjs').requireOpen((await tx.get(db.collection('settings').doc('shop'))).data());
    let declaration = {};
    const draftRef = db.collection('paymentDrafts').doc(input.id);
    if (declarationMode) {
      const draft = (await tx.get(draftRef)).data();
      if (!draft || draft.uid !== req.student.uid || draft.state !== 'open' || draft.requestHash !== requestHash || draft.amountPaise !== fixedAmount || Date.now()-draft.createdMs >= 24*3600000) throw failure(409,'Payment details changed or expired. Reopen checkout before confirming.');
      declaration = { paymentMethod:'self_declared_upi', paymentVerification:'student_declaration', paymentDeclaredAt:FieldValue.serverTimestamp(), paymentDeclaredBy:req.student.uid, lockedAmountPaise:fixedAmount, manualPayee:draft.payee };
    }
    const sessionRef = db.collection('uploadSessions').doc(input.id);
    const session = (await tx.get(sessionRef)).data();
    if (!session || session.uid !== req.student.uid || session.state !== 'open' || Date.now() - session.createdMs >= 48 * 3600000) throw failure(409, 'Upload session expired. Please start a new order.');
    for (const file of input.files) {
      const inspected = Object.values(session.files || {}).find(f => f.path === file.path && f.size === file.size);
      if (!inspected || (!Number.isInteger(inspected.pages) && inspected.pageCountSource !== 'manual')) throw failure(400, 'Document has not been checked. Upload the file again.');
      if (inspected.pageCountSource !== 'manual' && inspected.pages !== file.settings.pages) throw failure(409, 'The page count does not match the document. Select the file again to update your price.');
      file.pageCountSource = inspected.pageCountSource === 'manual' ? 'manual' : 'automatic';
    }
    if ((count.data()?.count || 0) >= 30) throw failure(429, 'Daily order limit reached. Please contact the shop.');
    const collectionSlot = await require('./collection-slots.cjs').allocateSlot(tx, db, Date.now(), paymentConfig.ordersCollection);
    tx.create(ref, { ...input, ...declaration, collectionSlot, uid: req.student.uid, email: req.student.email, status: 'accepted', paymentStatus: declarationMode ? 'declared_paid' : 'unpaid', quoteAmountPaise: fixedAmount, pricingMode: 'fixed', createdAt: FieldValue.serverTimestamp(), reviewStatus: 'approved' });
    if(declarationMode)tx.update(draftRef,{state:'ordered'});
    tx.set(quota, { count: (count.data()?.count || 0) + 1 });
    tx.update(sessionRef, { state: 'ordered', collection: paymentConfig.ordersCollection });
  });
  res.status(201).json({ order: publicOrder(await ref.get()) });
});
};
