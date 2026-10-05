const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createStore, FieldValue } = require('../server/realtime-store.cjs');
function fixture() {
  let data = null, version = 0, conflict = false;
  const resolve = value => JSON.parse(JSON.stringify(value), (key, v) => v?.['.sv'] === 'timestamp' ? 1700000000000 : v);
  const db = createStore({ credential: { getAccessToken: async () => ({ access_token: 'test' }) }, fetchImpl: async (url, options) => {
    const parts = new URL(url).pathname.replace(/^\/kitswApp\/?|\.json$/g, '').split('/').filter(Boolean);
    if (options.method === 'PUT') {
      if (conflict) { conflict = false; version++; data = { ...data, concurrent: { preserved: true } }; }
      if (options.headers['if-match'] !== String(version)) return new Response('null', { status: 412 });
      const saved=resolve(JSON.parse(options.body));
      if(!parts.length)data=saved;
      else {let parent=data;for(const p of parts.slice(0,-1))parent=parent[p] ||= {};parent[parts.at(-1)]=saved;}
      version++;
    }
    const value = parts.reduce((v, k) => v?.[k], data);
    return new Response(JSON.stringify(value ?? null), { headers: { etag: String(version) } });
  } });
  return { db, data: () => data, conflict: () => { conflict = true; } };
}
test('Realtime transactions retry conflicts and preserve concurrent records, timestamps and audits', async () => {
  const f = fixture(), ref = f.db.collection('orders').doc('one');
  f.conflict();
  await f.db.runTransaction(async tx => {
    assert.equal((await tx.get(ref)).exists, false);
    tx.create(ref, { uid: 'student', paymentStatus: 'unpaid', createdAt: FieldValue.serverTimestamp() });
    tx.create(ref.collection('audit').doc('event'), { action: 'created' });
  });
  assert.equal(f.data().concurrent.preserved, true);
  assert.equal((await ref.get()).data().createdAt.toDate().getTime(), 1700000000000);
  assert.equal(f.data().audits.orders.one.audit.event.action, 'created');
});

test('scoped status transactions update one order and its audit, preserve other orders, and reject outside writes',async()=>{
  const f=fixture(),a=f.db.collection('orders').doc('a'),b=f.db.collection('orders').doc('b');
  await f.db.runTransaction(tx=>{tx.create(a,{status:'printing'});tx.create(b,{status:'accepted'});});
  await f.db.runTransaction(async tx=>{assert.equal((await tx.get(a)).data().status,'printing');tx.update(a,{status:'ready'});tx.create(a.childCollection('audit').doc('change'),{action:'status_changed'});},a);
  assert.equal((await a.get()).data().status,'ready');assert.equal((await b.get()).data().status,'accepted');
  assert.equal(f.data().orders.a.audit.change.action,'status_changed');
  await assert.rejects(f.db.runTransaction(tx=>tx.update(b,{status:'collected'}),a),/outside its scope/);
  assert.equal((await b.get()).data().status,'accepted');
});

test('same-time concurrent orders allocate distinct numbers using conflict retries',async()=>{
  const {allocateSlot}=require('../server/collection-slots.cjs'); const f=fixture(),now=Date.parse('2026-10-05T10:24:00+05:30');
  const slots=await Promise.all(Array.from({length:6},()=>f.db.runTransaction(tx=>allocateSlot(tx,f.db,now))));
  assert.equal(new Set(slots.map(s=>s.number)).size,6);
  assert.ok(slots.every(s=>s.date==='2026-10-05'&&s.slot===2));
});
test('failed multi-record transaction leaves payment and receipt unchanged', async () => {
  const f = fixture(), ref = f.db.collection('orders').doc('one');
  await f.db.runTransaction(tx => tx.create(ref, { paymentStatus: 'unpaid' }));
  await assert.rejects(f.db.runTransaction(tx => {
    tx.update(ref, { paymentStatus: 'paid' });
    tx.create(ref, { paymentStatus: 'paid' });
  }));
  assert.equal((await ref.get()).data().paymentStatus, 'unpaid');
});
test('Realtime queries filter owners, sort dates and limit results; batch commits atomically', async () => {
  const { db } = fixture(); const orders = db.collection('orders'); const batch = db.batch();
  batch.create(orders.doc('a'), { uid: 'one', createdAt: 1 });
  batch.create(orders.doc('b'), { uid: 'two', createdAt: 3 });
  batch.create(orders.doc('c'), { uid: 'one', createdAt: 2 }); await batch.commit();
  assert.deepEqual((await orders.where('uid', '==', 'one').orderBy('createdAt', 'desc').limit(1).get()).docs.map(s => s.id), ['c']);
  assert.throws(() => orders.doc('../escape'));
});
