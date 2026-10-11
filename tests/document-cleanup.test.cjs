const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cleanupDocuments, deleteOrderDocuments } = require('../server/document-cleanup.cjs');
test('cleanup deletes eligible documents, retains records and retries failed removal', async () => {
  const now = 200 * 3600000;
  const records = {
    uploadSessions: {
      old: { state: 'ordered', collection: 'orders', files: { one: { path: 'old-file' } } },
      recent: { state: 'ordered', collection: 'orders', files: { one: { path: 'recent-file' } } },
      pending: { state: 'ordered', collection: 'orders', files: { one: { path: 'pending-file' } } },
      draft: { state: 'open', createdMs: now - 49 * 3600000, files: { one: { path: 'draft-file' } } }
    }, orders: {
      old: { status: 'collected', closedMs: now - 25 * 3600000, paymentStatus: 'paid' },
      recent: { status: 'cancelled', closedMs: now - 3600000 },
      pending: { status: 'printing', closedMs: now - 30 * 3600000 }
    }
  };
  const db = { collection: name => ({ doc: id => ({ name, id }), get: async () => ({ docs: Object.keys(records[name]).map(id => ({ id })) }) }), runTransaction: async fn => fn({ get: async ref => ({ data: () => records[ref.name][ref.id] }), update: (ref, data) => Object.assign(records[ref.name][ref.id], data) }) };
  await assert.rejects(cleanupDocuments({ db, now, bucket: { remove: async () => { throw Error('offline'); } } }));
  assert.equal(records.uploadSessions.old.state, 'deleting');
  const removed = [];
  await cleanupDocuments({ db, now, bucket: { remove: async paths => removed.push(...paths) } });
  assert.deepEqual(removed, ['old-file', 'draft-file']);
  assert.equal(records.orders.old.paymentStatus, 'paid');
  assert.equal(records.orders.old.documentsDeleted, true);
  assert.equal(records.uploadSessions.recent.state, 'ordered');
  assert.equal(records.uploadSessions.pending.state, 'ordered');
});

test('handover removes documents immediately and retains the order record', async () => {
  const now = 500000;
  const records = {
    uploadSessions: { order1: { state: 'ordered', collection: 'orders', files: { first: { path: 'private/one' }, second: { path: 'private/two' } } } },
    orders: { order1: { status: 'collected', closedMs: now, documentsDeleted: false, paymentStatus: 'declared_paid', files: [{ path: 'private/one' }, { path: 'private/two' }] } }
  };
  const db = {
    collection: name => ({ doc: id => ({ name, id }) }),
    runTransaction: async callback => callback({
      get: async ref => ({ data: () => records[ref.name][ref.id] }),
      update: (ref, value) => Object.assign(records[ref.name][ref.id], value),
      set: (ref, value) => { records[ref.name][ref.id] = value; }
    })
  };
  const removed = [];
  await deleteOrderDocuments({ db, bucket: { remove: async paths => removed.push(...paths) }, collection: 'orders', orderId: 'order1', now });
  assert.deepEqual(removed, ['private/one', 'private/two']);
  assert.equal(records.uploadSessions.order1.state, 'deleted');
  assert.equal(records.orders.order1.documentsDeleted, true);
  assert.equal(records.orders.order1.paymentStatus, 'declared_paid');
  assert.equal(records.orders.order1.status, 'collected');
});

test('24-hour boundary, active orders, missing records and independent cleanup failures are handled safely', async () => {
  const now = 50 * 3600000;
  const records={uploadSessions:{},orders:{}};
  const add=(id,state,age,status)=>{records.uploadSessions[id]={state,createdMs:now-age,collection:state==='ordered'?'orders':undefined,files:{one:{path:id}}}; if(status)records.orders[id]={status,closedMs:now-age};};
  add('cancel-boundary','ordered',24*3600000,'cancelled');
  add('cancel-young','ordered',24*3600000-1,'cancelled');
  add('open-boundary','open',24*3600000);
  add('open-young','open',24*3600000-1);
  add('paid-uncollected','ordered',49*3600000,'ready');
  add('printing','ordered',49*3600000,'printing');
  add('missing-order','ordered',49*3600000);
  const db={collection:name=>({doc:id=>({name,id}),get:async()=>({docs:Object.keys(records[name]).map(id=>({id}))})}),runTransaction:async fn=>fn({get:async ref=>({data:()=>records[ref.name][ref.id]}),update:(ref,data)=>Object.assign(records[ref.name][ref.id],data)})};
  const removed=[];
  await assert.rejects(cleanupDocuments({db,now,bucket:{remove:async paths=>{if(paths[0]==='cancel-boundary')throw Error('temporary');removed.push(...paths);}}}),/pending removals/);
  assert.deepEqual(removed,['open-boundary']);
  assert.equal(records.uploadSessions['cancel-boundary'].state,'deleting');
  for(const id of ['paid-uncollected','printing','missing-order','cancel-young'])assert.equal(records.uploadSessions[id].state,'ordered');
  assert.equal(records.uploadSessions['open-young'].state,'open');
  await cleanupDocuments({db,now,bucket:{remove:async paths=>removed.push(...paths)}});
  assert.equal(records.uploadSessions['cancel-boundary'].state,'deleted');
  assert.equal(records.orders['paid-uncollected'].documentsDeleted,undefined);
});
