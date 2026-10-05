const express = require('express');
const path = require('node:path');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { createStore, FieldValue, DATABASE_URL } = require('./realtime-store.cjs');
const { createDocumentStorage } = require('./document-storage.cjs');
const { idPattern } = require('./order-validation.cjs');
const { validSignature, assertCaptured } = require('./payment-security.cjs');
const { paymentConfiguration } = require('./payment-config.cjs');
const app = express();
app.disable('x-powered-by');
const root = path.resolve(__dirname, '..');
const ordersEnabled = process.env.KITSW_ENABLE_ORDERS === 'true';
let storageReady = !ordersEnabled;
const merchantName = process.env.MERCHANT_NAME || 'THEESKAPOOO';
const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;
const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
const paymentConfig = paymentConfiguration(process.env);
const paymentMode = paymentConfig.mode;
const paymentsEnabled = paymentConfig.enabled;
let db, bucket, adminAuth;
if (ordersEnabled) {
  initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID || 'theeskapooooo-a04b4', storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'theeskapooooo-a04b4.firebasestorage.app' });
  db = createStore({ credential: applicationDefault(), databaseURL: process.env.FIREBASE_DATABASE_URL || DATABASE_URL }); bucket = createDocumentStorage(); adminAuth = getAuth();
}
function failure(status, message) { return Object.assign(new Error(message), { httpStatus: status }); }
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff'); res.set('Referrer-Policy', 'strict-origin-when-cross-origin'); res.set('X-Frame-Options', 'SAMEORIGIN');
  if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
  next();
});
async function provider(route, body) {
  const response = await fetch('https://api.razorpay.com/v1/' + route, {
    method: body ? 'POST' : 'GET', headers: { Authorization: 'Basic ' + Buffer.from(keyId + ':' + keySecret).toString('base64'), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000)
  });
  const result = await response.json();
  if (!response.ok) throw failure(502, 'The payment provider could not complete this request. Please check order status before trying again.');
  return result;
}
function publicOrder(snapshot) {
  const order = snapshot.data();
  return { id: snapshot.id, priority: order.priority === true, priorityFeePaise: order.priorityFeePaise || 0, collectionSlot: order.collectionSlot || null, documentsDeleted: order.documentsDeleted === true, files: order.files.map(({ path: ignored, generation: ignoredGeneration, ...file }) => file), estimate: order.estimate, status: order.status, paymentStatus: order.paymentStatus, paymentPreference: order.paymentPreference, quoteAmountPaise: order.quoteAmountPaise, createdAt: order.createdAt.toDate().toISOString(), pickupTime: order.pickupTime, manualPayment: order.manualPayment ? { ...order.manualPayment, submittedAt: order.manualPayment.submittedAt?.toDate?.().toISOString() || null } : null, paymentMethod: order.paymentMethod || null, paymentReviewNote: order.paymentReviewNote || '' };
}
async function markPaid(ref, payment) {
  await db.runTransaction(async tx => {
    const snapshot = await tx.get(ref); if (!snapshot.exists) throw failure(404, 'Order not found.');
    const order = snapshot.data();
    assertCaptured(payment, { ...order, quoteAmountPaise: order.lockedAmountPaise });
    if (order.paymentStatus === 'paid') {
      if (order.paymentId !== payment.id) throw failure(409, 'Another payment already settled this order. Contact the shop.');
      return;
    }
    tx.update(ref, { paymentStatus: 'paid', paymentId: payment.id, paidAt: FieldValue.serverTimestamp(), checkoutState: 'paid' });
  });
}
// Raw bytes must be verified before parsing webhook JSON.
app.post('/api/payment-webhook', express.raw({ type: 'application/json', limit: '256kb' }), async (req, res) => {
  if (!paymentsEnabled || !['test','live'].includes(paymentMode)) throw failure(503, 'Gateway payments are not activated.');
  if (!Buffer.isBuffer(req.body) || !validSignature(req.body, req.get('x-razorpay-signature'), webhookSecret)) throw failure(401, 'Invalid webhook signature.');
  let event; try { event = JSON.parse(req.body.toString('utf8')); } catch { throw failure(400, 'Invalid webhook body.'); }
  if (event.event !== 'payment.captured') return res.json({ received: true });
  const entity = event.payload?.payment?.entity;
  if (!/^pay_[a-zA-Z0-9]+$/.test(entity?.id || '') || !/^order_[a-zA-Z0-9]+$/.test(entity?.order_id || '')) throw failure(400, 'Invalid payment event.');
  const mapping = await db.collection(paymentConfig.paymentCollection).doc(entity.order_id).get();
  // A callback may race with mapping persistence. Non-2xx asks the provider to retry.
  if (!mapping.exists) throw failure(503, 'Payment mapping pending. Retry webhook.');
  const payment = await provider('payments/' + entity.id);
  await markPaid(db.collection(paymentConfig.ordersCollection).doc(mapping.data().orderId), payment);
  res.json({ received: true });
});
app.use(express.json({ limit: '64kb' }));
app.get('/healthz', (req, res) => res.status(storageReady ? 200 : 503).json({ status: storageReady ? 'ready' : 'reconnecting' }));
app.get('/api/config', (req, res) => res.json({ ordersEnabled: ordersEnabled && storageReady, paymentsEnabled: paymentsEnabled && storageReady, serviceUnavailable: ordersEnabled && !storageReady, notificationSound: require('node:fs').existsSync(path.join(root, 'notification-voice.mp3')) ? '/notification-voice.mp3' : null, paymentMode, merchantName, hours: { normal: '09:00-17:30', exam: '08:30-17:30', timezone: 'Asia/Kolkata' } }));
const counters = new Map();
setInterval(() => { const now = Date.now(); for (const [key, value] of counters) if (value.until < now) counters.delete(key); }, 60000).unref();
app.use('/api', async (req, res, next) => {
  if (!ordersEnabled) throw failure(503, 'Live orders are not activated. The app team must configure the server and document storage.');
  if (!storageReady) throw failure(503, 'Document storage is reconnecting. Keep this page open and retry shortly.');
  const header = req.get('authorization') || '';
  if (!header.startsWith('Bearer ')) throw failure(401, 'Please sign in again.');
  let token; try { token = await adminAuth.verifyIdToken(header.slice(7), true); } catch { throw failure(401, 'Your session is invalid or expired. Please sign in again.'); }
  if (!token.email_verified || !/^[^\s@]+@kitsw\.ac\.in$/i.test(token.email || '')) throw failure(403, 'A verified KITSW college email is required.');
  const now = Date.now(); const counter = counters.get(token.uid) || { count: 0, until: now + 60000 };
  if (counter.until < now) { counter.count = 0; counter.until = now + 60000; }
  counter.count++; counters.set(token.uid, counter);
  if (counter.count > 60) throw failure(429, 'Too many requests. Wait a minute and retry.');
  req.student = token; next();
});
require('./manual-routes.cjs')(app, { db, bucket, paymentConfig, publicOrder, FieldValue, env: process.env });
require('./payment-drafts.cjs')(app, { db, paymentConfig, publicOrder, env: process.env });
require('./upload-routes.cjs')(app, { db, bucket });
require('./shop-settings.cjs').registerShop(app, { db, isOperator: token => require('./manual-payments.cjs').isOperator(token, process.env.PRINT_OPERATOR_EMAILS) });
require('./order-routes.cjs')(app, { db, bucket, paymentConfig, publicOrder, FieldValue });

async function ownedOrder(req) {
  if (!idPattern.test(req.params.id)) throw failure(404, 'Order not found.');
  const ref = db.collection(paymentConfig.ordersCollection).doc(req.params.id); const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data().uid !== req.student.uid) throw failure(404, 'Order not found.');
  return { ref, order: snapshot.data() };
}
app.post('/api/orders/:id/checkout', async (req, res) => {
  if (!paymentsEnabled || !['test','live'].includes(paymentMode)) throw failure(503, 'Use the configured manual-payment flow or pay at collection.');
  const { ref } = await ownedOrder(req);
  let stored;
  await db.runTransaction(async tx => {
    const snapshot = await tx.get(ref); const order = snapshot.data();
    if (order.paymentStatus === 'paid') throw failure(409, 'This order is already paid. Refresh your orders.');
    if (['cancelled','collected'].includes(order.status)) throw failure(409, 'This order is no longer payable online.');
    if (!Number.isInteger(order.quoteAmountPaise) || order.quoteAmountPaise <= 0 || order.quoteAmountPaise > 5000000 || order.reviewStatus !== 'approved') throw failure(409, 'The shop must review the documents and confirm your quote first.');
    if (order.providerOrderId) { stored = { ...order }; return; }
    if (order.checkoutState === 'creating') throw failure(409, 'Checkout is being prepared or needs reconciliation. Refresh your orders; do not start another payment.');
    tx.update(ref, { checkoutState: 'creating', lockedAmountPaise: order.quoteAmountPaise });
    stored = { ...order, lockedAmountPaise: order.quoteAmountPaise };
  });
  if (!stored.providerOrderId) {
    // Never retry provider creation automatically after an ambiguous timeout.
    // The stable receipt lets the operator reconcile a creating checkout.
    const created = await provider('orders', { amount: stored.lockedAmountPaise, currency: 'INR', receipt: req.params.id, partial_payment: false });
    if (!/^order_[a-zA-Z0-9]+$/.test(created.id || '') || created.amount !== stored.lockedAmountPaise || created.currency !== 'INR') throw failure(502, 'Unexpected payment-provider order response.');
    stored.providerOrderId = created.id;
    const batch = db.batch();
    batch.update(ref, { providerOrderId: created.id, checkoutState: 'created' });
    batch.create(db.collection(paymentConfig.paymentCollection).doc(created.id), { orderId: req.params.id });
    await batch.commit();
  }
  if (stored.quoteAmountPaise !== stored.lockedAmountPaise) throw failure(409, 'The quote changed after checkout creation. Contact the shop before paying.');
  res.json({ keyId, providerOrderId: stored.providerOrderId, amount: stored.lockedAmountPaise, merchantName, paymentMode });
});
app.post('/api/orders/:id/verify-payment', async (req, res) => {
  if (!paymentsEnabled || !['test','live'].includes(paymentMode)) throw failure(503, 'Gateway payments are not activated.');
  const { ref, order } = await ownedOrder(req);
  const body = req.body;
  if (!/^pay_[a-zA-Z0-9]+$/.test(body.razorpay_payment_id || '') || body.razorpay_order_id !== order.providerOrderId || !validSignature(`${order.providerOrderId}|${body.razorpay_payment_id}`, body.razorpay_signature, keySecret)) throw failure(400, 'Payment signature could not be verified.');
  const payment = await provider('payments/' + body.razorpay_payment_id);
  if (payment.order_id !== order.providerOrderId || payment.amount !== order.lockedAmountPaise || payment.currency !== 'INR') throw failure(400, 'Payment details do not match this order.');
  if (payment.status !== 'captured') return res.json({ status: 'pending', message: 'Payment is awaiting capture. Refresh orders; do not pay again yet.' });
  await markPaid(ref, payment); res.json({ status: 'paid' });
});
// Only these public assets are served. Never expose .env, backend code or credentials.
const publicFiles = ['index.html','college-source.html','dashboard.html','operator.html','operator.js','styles.css','dashboard.css','app.js','auth-service.js','firebase-config.js','print-core.js','order-service.js','dashboard.js','tech-titans.svg','kitsw-logo.jpg','theeskapooo-logo.svg','theeskapooo-icon.svg','document-pages.js','document-pages-core.js','document-pages-worker.js','order-alerts.js','notification-voice.mp3'];
app.get('/vendor/pdf-lib.min.js', (req, res) => res.sendFile(path.join(root, 'node_modules/pdf-lib/dist/pdf-lib.min.js')));
app.get('/', (req, res) => res.sendFile(path.join(root, 'index.html')));
for (const file of publicFiles) app.get('/' + file, (req, res) => res.sendFile(path.join(root, file)));
app.use((req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  // Do not log tokens, payment credentials, document names or request bodies.
  const status = error.httpStatus || (error.type === 'entity.parse.failed' ? 400 : 500);
  if (status === 500) console.error('Request failed:', typeof error.code === 'string' ? error.code : 'server-error');
  res.status(status).json({ error: error.httpStatus ? error.message : status === 400 ? 'Invalid request JSON.' : 'The server could not complete the request. Check server credentials, Realtime Database and Supabase storage setup.' });
});
if (require.main === module) {
  app.listen(Number(process.env.PORT) || 4174, process.env.HOST || '127.0.0.1', () => console.log('THEESKAPOOO: http://localhost:' + (process.env.PORT || 4174))).on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? 'This port already has a server.' : 'Server could not listen.');
    process.exit(error.code === 'EADDRINUSE' ? 78 : 1);
  });
  if (ordersEnabled) {
    let checking = false;
    const connectStorage = async () => {
      if (checking || storageReady) return;
      checking = true;
      try { await bucket.check(); storageReady = true; require('./document-cleanup.cjs').startCleanup({ db, bucket }); }
      catch { console.error('Document storage unavailable; website stays open. Retrying in 30 seconds.'); }
      finally { checking = false; }
    };
    connectStorage(); setInterval(connectStorage, 30000).unref();
  }
}
module.exports = app;
