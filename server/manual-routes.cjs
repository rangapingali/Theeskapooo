const crypto = require('node:crypto');
const QRCode = require('qrcode');
const { pipeline } = require('node:stream/promises');
const logic = require('./manual-payments.cjs');
const { idPattern } = require('./order-validation.cjs');
module.exports = function manualRoutes(app, deps) {
  const { db, bucket, paymentConfig, publicOrder, FieldValue, env } = deps;
  const fail = (code, text) => Object.assign(new Error(text), { httpStatus: code });
  const operator = token => logic.isOperator(token, env.PRINT_OPERATOR_EMAILS);
  const manualEnabled = () => { if (!['manual','self_declared'].includes(paymentConfig.mode) || !paymentConfig.enabled) throw fail(503, 'Payment instructions are not enabled.'); };
  const refFor = id => { if (!idPattern.test(id)) throw fail(404, 'Order not found.'); return db.collection(paymentConfig.ordersCollection).doc(id); };
  const owned = (snapshot, uid) => { if (!snapshot.exists || snapshot.data().uid !== uid) throw fail(404, 'Order not found.'); return snapshot.data(); };
  const audit = (tx, ref, actor, action, extra = {}) => tx.create((ref.childCollection ? ref.childCollection('audit') : ref.collection('audit')).doc(), { actorUid: actor.uid, action, ...extra, at: FieldValue.serverTimestamp() });
  app.get('/api/me', (req, res) => res.json({ isOperator: operator(req.student), isAdmin: require('./access-roles.cjs').isAdmin(req.student, env) }));
  app.post('/api/orders/:id/manual-instructions', async (req, res) => {
    manualEnabled(); const ref = refFor(req.params.id); let info;
    await db.runTransaction(async tx => {
      const order = owned(await tx.get(ref), req.student.uid);
      if (order.paymentStatus === 'pending_verification' && paymentConfig.mode !== 'self_declared') throw fail(409, 'Awaiting recipient confirmation. Do not pay again.');
      info = logic.instructions(order, ref.id, env);
      tx.update(ref, { manualPayee: info.payee, lockedAmountPaise: info.amountPaise });
    });
    res.json({ ...info, qr: await QRCode.toDataURL(info.uri, { width: 256, margin: 2 }), verifiedByBank: false });
  });
  app.post('/api/orders/:id/manual-payment', async (req, res) => {
    if(paymentConfig.mode === 'self_declared')throw fail(409,'Use the payment confirmation checkbox. Recipient approval is no longer required.');
    manualEnabled(); const ref = refFor(req.params.id);
    await db.runTransaction(async tx => {
      const order = owned(await tx.get(ref), req.student.uid);
      const reference = logic.normalizeReference(req.body.reference);
      if (order.paymentStatus === 'pending_verification' && order.manualPayment?.reference === reference) return;
      if ((order.manualAttempts || 0) >= 5) throw fail(409, 'Too many claims. Contact the recipient.');
      const patch = logic.claimPatch(order, reference, crypto.randomUUID());
      patch.manualPayment.submittedAt = FieldValue.serverTimestamp();
      tx.update(ref, { ...patch, manualAttempts: (order.manualAttempts || 0) + 1, paymentReviewNote: '' });
      audit(tx, ref, req.student, 'payment_claim_submitted', { claimId: patch.manualPayment.claimId });
    });
    res.json({ status: 'pending_verification' });
  });
  // Existing unpaid/pending orders can use the new declaration without paying twice.
  app.post('/api/orders/:id/declare-payment',async(req,res)=>{
    if(paymentConfig.mode!=='self_declared'||!paymentConfig.enabled)throw fail(503,'Student payment declarations are not enabled.');
    if(req.body.paymentDeclared!==true)throw fail(400,'Select the payment confirmation checkbox.');
    const ref=refFor(req.params.id);let updated;
    await db.runTransaction(async tx=>{
      const order=owned(await tx.get(ref),req.student.uid);
      if(['paid','declared_paid'].includes(order.paymentStatus)){updated=order;return;}
      logic.checkPayable(order);
      const patch={paymentStatus:'declared_paid',paymentMethod:'self_declared_upi',paymentVerification:'student_declaration',paymentDeclaredAt:FieldValue.serverTimestamp(),paymentReceivedMs:Date.now(),paymentDeclaredBy:req.student.uid,paymentReviewNote:'Student declared payment; not bank-verified'};
      tx.update(ref,patch);audit(tx,ref,req.student,'student_payment_declared',{amountPaise:order.quoteAmountPaise});updated={...order,...patch};
    },ref);
    res.json({order:publicOrder({id:ref.id,data:()=>updated})});
  });
  app.use('/api/operator', (req, res, next) => operator(req.student) ? next() : next(fail(403, 'This account does not have operator access. Your student account is unchanged.')));
  app.get('/api/operator/orders', async (req, res) => {
    await require('./offline-numbers.cjs').expireOfflineOrders(db,paymentConfig.ordersCollection);
    const list = await db.collection(paymentConfig.ordersCollection).orderBy('createdAt', 'desc').get();
    res.json({ orders: list.docs.map(s => ({ ...publicOrder(s), uid: s.data().uid, email: s.data().email, notes: s.data().notes, reviewStatus: s.data().reviewStatus, closedMs: s.data().closedMs || null, lockedAmountPaise: s.data().lockedAmountPaise || null, providerOrderId: s.data().providerOrderId || null })) });
  });
  app.post('/api/operator/orders/:id/quote', async (req, res) => {
    throw fail(410, 'Manual quoting has been removed. New orders use fixed prices.');

  });
  app.post('/api/operator/orders/:id/payment-review', async (req, res) => {
    if(paymentConfig.mode==='self_declared')throw fail(409,'Recipient approval is disabled. Students confirm their own payment declaration.');
    const ref = refFor(req.params.id);
    let updated;
    await db.runTransaction(async tx => {
      const s = await tx.get(ref); if (!s.exists) throw fail(404, 'Order not found.');
      const order = s.data(); const patch = logic.decisionPatch(order, req.student, req.body);
      if (patch.paymentStatus === 'paid') {
        const referenceRef = db.collection('confirmedManualReferences').doc(logic.referenceKey(order.manualPayment.payee.upiId, order.manualPayment.reference));
        const previous = await tx.get(referenceRef);
        if (previous.exists && previous.data().orderId !== ref.id) throw fail(409, 'This reference has already paid another order.');
        tx.set(referenceRef, { orderId: ref.id, confirmedBy: req.student.uid, confirmedAt: FieldValue.serverTimestamp() });
        patch.paidAt = FieldValue.serverTimestamp();
        patch.paymentReceivedMs = Date.now();
      }
      tx.update(ref, { ...patch, paymentReviewedAt: FieldValue.serverTimestamp() });
      updated = { ...order, ...patch };
      audit(tx, ref, req.student, req.body.decision === 'approve' ? 'manual_payment_approved' : 'manual_payment_rejected', { claimId: order.manualPayment.claimId, amountPaise: order.manualPayment.amountPaise, reason: patch.paymentReviewNote });
    }); res.json({ ok: true, order: publicOrder({ id: ref.id, data: () => updated }) });
  });
  app.post('/api/operator/orders/:id/cash', async (req, res) => {
    const ref = refFor(req.params.id);
    await require('./offline-numbers.cjs').expireOfflineOrders(db,paymentConfig.ordersCollection);
    let updated;
    await db.runTransaction(async tx => {
      const s = await tx.get(ref); if (!s.exists) throw fail(404, 'Order not found.'); const order = s.data();
      if (require('./offline-numbers.cjs').isExpired(order)) throw fail(409,'The payment grace period has ended. This offline order has expired.');
      if (order.offlineNumber && req.body.studentPresent !== true) throw fail(409,'Confirm the student is present and match their offline identification number.');
      if (order.paymentStatus === 'paid' && order.paymentMethod === 'cash' && order.paymentConfirmedBy === req.student.uid && req.body.receiptChecked === true && req.body.amountPaise === order.quoteAmountPaise) { updated = order; return; }
      if (order.uid === req.student.uid || req.body.receiptChecked !== true || order.paymentStatus !== 'unpaid' || (order.lockedAmountPaise && req.body.noUpiReceived !== true) || order.providerOrderId || order.reviewStatus !== 'approved' || !Number.isInteger(order.quoteAmountPaise) || order.quoteAmountPaise <= 0 || order.quoteAmountPaise !== req.body.amountPaise || ['cancelled','collected'].includes(order.status)) throw fail(409, 'Cash requires another student\'s unpaid order and confirmation that no UPI transfer was received.');
      const patch = { paymentStatus: 'paid', paymentMethod: 'cash', paidAt: FieldValue.serverTimestamp(), paymentReceivedMs: Date.now(), paymentConfirmedBy: req.student.uid };
      tx.update(ref, patch);
      updated = { ...order, ...patch };
      audit(tx, ref, req.student, 'cash_received', { amountPaise: order.quoteAmountPaise });
    }, ref); res.json({ ok: true, order: publicOrder({ id: ref.id, data: () => updated }) });
  });
  app.post('/api/operator/orders/:id/status', async (req, res) => {
    const ref = refFor(req.params.id);
    let updated;
    await db.runTransaction(async tx => {
      const s = await tx.get(ref); if (!s.exists) throw fail(404, 'Order not found.');
      const order = s.data();
      if (order.uid === req.student.uid) throw fail(403, 'Ask another operator to handle your own order.');
      if (req.body.status === 'printing' && order.paymentPreference === 'offline' && req.body.studentPresent !== true) throw fail(409,'Offline documents can only be printed while the student is present.');
      if (req.body.status === 'printing' && (order.files || []).some(file => file.pageCountSource === 'manual') && req.body.pagesChecked !== true) throw fail(409, 'Check the student-entered page counts before printing.');
      if (['printing','ready','collected'].includes(req.body.status)) require('./payment-security.cjs').requireVerifiedPrintPayment(order,paymentConfig.mode);
      const patch = logic.statusPatch(order, req.body.status);
      if (['collected', 'cancelled'].includes(patch.status)) patch.closedMs = Date.now();
      if (patch.closedMs) await require('./offline-numbers.cjs').releaseOfflineNumber(tx,db,order,ref.id,paymentConfig.ordersCollection);
      tx.update(ref, patch); audit(tx, ref, req.student, 'status_changed', patch);
      updated = { ...order, ...patch };
    }, ['collected','cancelled'].includes(req.body.status) ? undefined : ref);
    if (updated.status === 'collected') {
      // Confirm the saved handover promptly; deletion failure must not look like a failed status update.
      void require('./document-cleanup.cjs').deleteOrderDocuments({ db, bucket, collection: paymentConfig.ordersCollection, orderId: ref.id })
        .catch(() => console.error('Collected document removal pending; scheduled cleanup will retry.'));
    }
    res.json({ ok: true, order: publicOrder({ id: ref.id, data: () => updated }) });
  });
  const previewSlot = require('./http-protection.cjs').uploadSlots(1);
  app.get('/api/operator/orders/:id/files/:index', (req,res,next) => req.query.printPreview === '1' || req.query.prepared === '1' ? previewSlot(req,res,next) : next(), async (req, res) => {
    const s = await refFor(req.params.id).get(); if (!s.exists) throw fail(404, 'Order not found.');
    require('./payment-security.cjs').requireVerifiedPrintPayment(s.data(),paymentConfig.mode);
    if (s.data().documentsDeleted || s.data().status === 'collected') throw fail(410, 'Documents are unavailable after the order is handed over.');
    if (!/^\d+$/.test(req.params.index)) throw fail(404, 'Document not found.');
    const file = s.data().files[Number(req.params.index)]; if (!file) throw fail(404, 'Document not found.');
    if (req.query.prepared === '1') {
      const order = s.data();
      if (!['accepted','printing','ready'].includes(order.status) || !['paid','declared_paid'].includes(order.paymentStatus)) throw fail(409, 'Prepare printing only for an active paid order.');
      if (order.uid === req.student.uid) throw fail(403, 'Another operator must print your own order.');
      if (order.paymentPreference === 'offline' && order.status === 'accepted') throw fail(409, 'Confirm the student is present and mark printing first.');
      const chunks = []; let size = 0;
      for await (const chunk of bucket.file(file.path, { generation: file.generation }).createReadStream()) { size += chunk.length; if (size > 25*1024*1024) throw fail(413, 'Document too large.'); chunks.push(chunk); }
      const pdf = await require('./shop-print-pdf.cjs').prepare(Buffer.concat(chunks), file.name, file.settings);
      res.set('Cache-Control','no-store'); res.set('Content-Type','application/pdf'); res.set('Content-Disposition','inline; filename="prepared-print.pdf"'); return res.send(pdf);
    }
    if (req.query.printPreview === '1' && /\.(png|jpe?g|webp)$/i.test(file.name)) {
      const chunks=[];let size=0;
      for await (const chunk of bucket.file(file.path, { generation: file.generation }).createReadStream()) { size+=chunk.length; if(size>25*1024*1024)throw fail(413,'Image too large.'); chunks.push(chunk); }
      const pdf=await require('./print-image.cjs').imagePdf(Buffer.concat(chunks),file.settings.orientation);
      res.set('Content-Type','application/pdf');res.set('Content-Disposition','inline; filename="print.pdf"');return res.send(pdf);
    }
    res.attachment(file.name); res.set('Content-Type', 'application/octet-stream');
    await pipeline(bucket.file(file.path, { generation: file.generation }).createReadStream(), res);
  });
};
