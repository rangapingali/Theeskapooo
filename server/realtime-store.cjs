// Small server-only repository adapter. Cross-record updates use RTDB ETag CAS
// on the isolated kitswApp subtree so quotas, receipts and audits commit together.
const { randomUUID } = require('node:crypto');
const DATABASE_URL = 'https://theeskapooooo-a04b4-default-rtdb.asia-southeast1.firebasedatabase.app';
const FieldValue = { serverTimestamp: () => ({ '.sv': 'timestamp' }) };
const key = value => {
  if (typeof value !== 'string' || !value || /[.#$\[\]/]/.test(value) || ['__proto__', 'constructor', 'prototype'].includes(value)) throw new Error('Invalid database key');
  return value;
};
function hydrate(value, name = '') {
  if (typeof value === 'number' && /At$/.test(name)) return { toDate: () => new Date(value) };
  if (Array.isArray(value)) return value.map(v => hydrate(v));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, hydrate(v, k)]));
  return value;
}
function snapshot(ref, value) { return { id: ref.id, exists: value != null, data: () => value == null ? undefined : hydrate(structuredClone(value)) }; }
function createStore({ credential, databaseURL = DATABASE_URL, fetchImpl = fetch }) {
  const base = databaseURL.replace(/\/$/, '') + '/kitswApp';
  async function request(path, options = {}, query = '') {
    const token = await credential.getAccessToken();
    const response = await fetchImpl(base + (path ? '/' + path : '') + '.json' + query, {
      ...options, headers: { Authorization: 'Bearer ' + token.access_token, 'Content-Type': 'application/json', ...options.headers }, signal: AbortSignal.timeout(20000)
    });
    if (!response.ok && response.status !== 412) throw Object.assign(new Error('Realtime Database request failed'), { code: String(response.status), httpStatus: 503 });
    return response;
  }
  const locate = (root, ref) => ref.parts.reduce((obj, part) => obj?.[part], root);
  function write(root, ref, value) {
    let node = root;
    for (const part of ref.parts.slice(0, -1)) node = node[part] ||= {};
    node[ref.id] = structuredClone(value);
  }
  function transaction(root) {
    let changed = false;
    return {
      get: async ref => snapshot(ref, locate(root, ref)),
      create(ref, value) { if (locate(root, ref) != null) throw Object.assign(new Error('Record already exists'), { httpStatus: 409 }); write(root, ref, value); changed = true; },
      set(ref, value) { write(root, ref, value); changed = true; },
      update(ref, value) { const old = locate(root, ref); if (old == null) throw Object.assign(new Error('Record not found'), { httpStatus: 404 }); write(root, ref, { ...old, ...value }); changed = true; },
      changed: () => changed
    };
  }
  function collection(parts, filter, sort, maximum) {
    return {
      doc(id = randomUUID()) {
        const ref = { id: key(id), parts: [...parts, key(id)] };
        ref.get = async () => snapshot(ref, await (await request(ref.parts.join('/'))).json());
        ref.collection = name => collection(['audits', ...ref.parts, key(name)]);
        ref.childCollection = name => collection([...ref.parts, key(name)]);
        return ref;
      },
      where(field, op, value) { if (op !== '==') throw new Error('Unsupported query'); return collection(parts, [key(field), value], sort, maximum); },
      orderBy(field, direction) { return collection(parts, filter, [key(field), direction], maximum); },
      limit(n) { return collection(parts, filter, sort, n); },
      async get() {
        const query = filter ? '?' + new URLSearchParams({ orderBy: JSON.stringify(filter[0]), equalTo: JSON.stringify(filter[1]) }) : '';
        let response;
        try { response = await request(parts.join('/'), {}, query); }
        catch (error) {
          // Keep existing installations working until the index rules deploy.
          if (!query || error.code !== '400') throw error;
          response = await request(parts.join('/'));
        }
        const rows = Object.entries(await response.json() || {})
          .filter(([, v]) => !filter || v[filter[0]] === filter[1]);
        if (sort) rows.sort((a, b) => ((a[1][sort[0]] || 0) - (b[1][sort[0]] || 0)) * (sort[1] === 'desc' ? -1 : 1));
        return { docs: rows.slice(0, maximum ?? rows.length).map(([id, value]) => snapshot({ id }, value)) };
      }
    };
  }
  const store = {
    collection: name => collection([key(name)]),
    async runTransaction(callback, scopeRef) {
      const scope = scopeRef?.parts?.join('/') || '';
      for (let attempt = 0; attempt < 8; attempt++) {
        const response = await request(scope, { headers: { 'X-Firebase-ETag': 'true' } });
        const etag = response.headers.get('etag');
        if (!etag) throw new Error('Database did not return a transaction ETag');
        const value = await response.json();
        const root = scope ? {} : value || {};
        if (scope && value != null) write(root, scopeRef, value);
        const tx = transaction(root);
        if (scope) for (const method of ['get','set','create','update']) {
          const operation = tx[method];
          tx[method] = (ref, ...args) => {
            if (ref.parts.slice(0, scopeRef.parts.length).join('/') !== scope) throw Error('Transaction reference is outside its scope');
            return operation(ref, ...args);
          };
        }
        const result = await callback(tx);
        if (!tx.changed()) return result;
        const saved = await request(scope, { method: 'PUT', headers: { 'if-match': etag }, body: JSON.stringify(scope ? locate(root, scopeRef) : root) });
        if (saved.status !== 412) return result;
      }
      throw Object.assign(new Error('Orders are busy. Please retry.'), { httpStatus: 409 });
    },
    batch() {
      const operations = []; const batch = {};
      for (const method of ['create', 'update', 'set']) batch[method] = (ref, data) => operations.push([method, ref, data]);
      batch.commit = () => store.runTransaction(tx => { for (const [method, ref, data] of operations) tx[method](ref, data); });
      return batch;
    }
  };
  return store;
}
module.exports = { createStore, FieldValue, DATABASE_URL };
