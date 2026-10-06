const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const tick = () => new Promise(resolve => setImmediate(resolve));
async function dashboard(preview = true, service = {}) {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8'), { url: 'http://localhost/dashboard.html' + (preview ? '?preview=1' : ''), runScripts: 'outside-only' });
  const w = dom.window;
  w.setInterval = () => 0;
  w.DocumentPages = service.documentPages || { count: async file => file.name === 'notes.pdf' ? 5 : file.name.startsWith('<img') ? 6 : 1 };
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
  w.KitswAuth = { current: async () => ({ email: 'student@kitsw.ac.in', emailVerified: true }), isCollegeEmail: () => true };
  w.OrderService = { shop: async () => ({ acceptingOrders: true }), configuration: async () => ({ ordersEnabled: false, paymentsEnabled: false }), list: async () => ({ orders: [] }), ...service };
  w.eval(fs.readFileSync(path.join(root, 'print-core.js'), 'utf8'));
  w.eval(fs.readFileSync(path.join(root, 'dashboard.js'), 'utf8'));
  await tick();
  const $ = selector => w.document.querySelector(selector);
  return {
    dom, w, $,
    async add(names) { const input = $('#file-input'); Object.defineProperty(input, 'files', { configurable: true, value: names.map(name => new w.File(['document content'], name, { type: 'application/octet-stream' })) }); input.dispatchEvent(new w.Event('change')); await tick(); },
    input(id, value) { const el = $('#' + id); el.value = value; el.dispatchEvent(new w.Event('input', { bubbles: true })); },
    review() { $('#review-confirm').checked = true; $('#review-confirm').dispatchEvent(new w.Event('change')); }
  };
}

test('payment-first checkout creates nothing before Done and safely retries the same order', async () => {
  let calls = [], fail = true, saved = [];
  const ui = await dashboard(false, {
    configuration: async () => ({ ordersEnabled: true, paymentsEnabled: true, paymentMode: 'self_declared' }),
    upload: async () => [], list: async () => ({ orders: saved }),
    preparePayment: async () => ({ amountPaise: 2500, qr:'data:image/png;base64,TEST', uri:'upi://pay?pa=test%40bank', payee:{name:'Test',upiId:'test@bank'} }),
    create: async body => {
      calls.push(body);
      if (fail) throw Error('Connection interrupted');
      const order = {...body, createdAt:new Date().toISOString(), paymentStatus:'declared_paid', status:'accepted', quoteAmountPaise:2500, estimate:{amount:25}, collectionSlot:{slot:1,number:9,date:'2026-10-06',startHour:9,endHour:10}};
      saved = [order]; return {order};
    }
  });
  try {
    await ui.add(['notes.pdf']); ui.review(); ui.$('#place-order').click(); await tick();
    assert.equal(calls.length,0); assert.equal(ui.$('#payment-dialog').open,true);
    assert.equal(ui.$('#submit-manual').disabled,true); assert.equal(ui.$('#manual-reference').required,false);
    assert.equal(ui.$('#pay-at-collection').hidden,true); assert.equal(ui.$('.payment-options').hidden,true);
    ui.$('#close-payment').click(); assert.equal(calls.length,0); assert.equal(ui.$('#total-files').textContent,'1');
    ui.$('#place-order').click(); await tick();
    ui.$('#manual-declaration').checked=true; ui.$('#manual-declaration').dispatchEvent(new ui.w.Event('change'));
    ui.$('#submit-manual').click(); await tick();
    assert.equal(calls.length,1); assert.equal(calls[0].paymentDeclared,true); assert.equal(calls[0].paymentPreference,'online');
    assert.equal(ui.$('#payment-dialog').open,true); assert.equal(ui.$('#total-files').textContent,'1');
    assert.match(ui.$('#manual-feedback').textContent,/do not transfer again/);
    fail=false; ui.$('#submit-manual').click(); ui.$('#submit-manual').click(); await tick(); await tick();
    assert.equal(calls.length,2); assert.equal(calls[1].id,calls[0].id);
    assert.equal(ui.$('#payment-dialog').open,false); assert.equal(ui.$('#total-files').textContent,'0');
    assert.match(ui.$('#orders-list').textContent,/Declared paid/); assert.match(ui.$('#orders-list').textContent,/No. 009/);
    assert.equal(ui.$('#orders-list .secondary-action'),null);
  } finally {ui.dom.window.close();}
});
test('preview dashboard: upload, estimate, range validation and order creation work together', async () => {
  const ui = await dashboard();
  try {
    assert.match(ui.$('#mode-banner').textContent, /PREVIEW/);
    assert.equal(ui.$('#place-order').disabled, true);
    await ui.add(['notes.pdf']); assert.equal(ui.$('#total-files').textContent, '1');
    ui.input('pages', 5); ui.input('copies', 2); ui.input('sides', 'double'); ui.review();
    assert.equal(ui.$('#total-sheets').textContent, '6'); assert.match(ui.$('#total-price').textContent, /50/);
    assert.equal(ui.$('#place-order').disabled, false);
    ui.input('range', '1-99'); assert.equal(ui.$('#place-order').disabled, true);
    ui.input('range', '1-3'); assert.match(ui.$('#total-price').textContent, /30/);
    ui.$('#place-order').click(); await tick();
    assert.equal(ui.$('#orders-view').hidden, false);
    assert.match(ui.$('#orders-message').textContent, /No documents were uploaded/);
    assert.match(ui.$('#orders-list').textContent, /notes.pdf/);
    assert.equal(ui.$('#total-files').textContent, '0');
    ui.$('#orders-list .secondary-action').click();
    assert.match(ui.$('#payment-message').textContent, /No money/);
    assert.equal(ui.$('#start-payment').hidden, true);
  } finally { ui.dom.window.close(); }
});
test('file settings remain independent and filenames cannot inject HTML', async () => {
  const ui = await dashboard();
  try {
    await ui.add(['<img src=x onerror=alert(1)>.pdf', 'second.pdf']);
    assert.equal(ui.$('#file-list img'), null);
    ui.input('pages', 6); ui.input('colour', 'colour');
    ui.$('#file-list .file-row:nth-child(2) .file-pick').click();
    assert.equal(ui.$('#pages').value, '1'); assert.equal(ui.$('#colour').value, 'bw');
    ui.input('pages', 2); ui.input('copies', 3); ui.$('#apply-all').click();
    ui.$('#file-list .file-row:first-child .file-pick').click();
    assert.equal(ui.$('#pages').value, '6'); assert.equal(ui.$('#copies').value, '3');
    await ui.add(['bad.exe']); assert.match(ui.$('#file-feedback').textContent, /Unsupported format/);
    ui.$('#file-list .remove-file').click(); assert.equal(ui.$('#total-files').textContent, '1');
  } finally { ui.dom.window.close(); }
});

test('counting blocks checkout, then prices detected pages; errors do not become one-page orders', async () => {
  let finish;
  const ui = await dashboard(true, { documentPages: { count: () => new Promise(resolve => { finish = resolve; }) } });
  try {
    await ui.add(['counting.pdf']); ui.review();
    assert.equal(ui.$('#place-order').disabled, true); assert.match(ui.$('#total-price').textContent, /Counting/);
    finish(12); await tick();
    assert.equal(ui.$('#pages').value, '12'); assert.equal(ui.$('#pages').readOnly, true); assert.match(ui.$('#total-price').textContent, /60/);
    ui.input('pages', 1); assert.match(ui.$('#total-price').textContent, /60/);
    ui.w.DocumentPages.count = async () => { throw Error('Export to PDF first.'); };
    await ui.add(['essay.docx']); assert.equal(ui.$('#place-order').disabled, true); assert.match(ui.$('#summary-error').textContent, /Export to PDF/);
  } finally { ui.dom.window.close(); }
});
test('unconfigured live service cannot submit an order', async () => {
  const ui = await dashboard(false);
  try { await ui.add(['report.pdf']); ui.review(); assert.equal(ui.$('#place-order').disabled, true); assert.match(ui.$('#mode-banner').textContent, /not activated/); }
  finally { ui.dom.window.close(); }
});

test('manual page entry and priority fee update the total without altering automatic page counts', async () => {
  const ui = await dashboard(true, { documentPages: { count: async f => f.name.endsWith('.docx') ? null : 5 } });
  try {
    await ui.add(['essay.docx']); ui.review();
    assert.equal(ui.$('#pages').readOnly, false); assert.equal(ui.$('#place-order').disabled, true);
    ui.input('pages', 3); ui.input('copies',2);
    assert.match(ui.$('#total-price').textContent,/30/); assert.equal(ui.$('#place-order').disabled,false);
    ui.$('#urgent-order').checked=true;ui.$('#urgent-order').dispatchEvent(new ui.w.Event('change'));
    assert.match(ui.$('#total-price').textContent,/38/);assert.equal(ui.$('#priority-summary').hidden,false);
    await ui.add(['notes.pdf']); ui.$('#file-list .file-row:nth-child(2) .file-pick').click();
    assert.equal(ui.$('#pages').readOnly,true); ui.input('pages',1);assert.match(ui.$('#total-price').textContent,/63/);
    ui.$('#place-order').click(); await tick();assert.match(ui.$('#orders-list').textContent,/Urgent order/);
  } finally {ui.dom.window.close();}
});

test('server recovery keeps selected files and unlocks ordering after reconnection',async()=>{
  let available=false;
  const ui=await dashboard(false,{configuration:async()=>({ordersEnabled:available,backendUnavailable:!available}),shop:async()=>({acceptingOrders:true})});
  try {
    await ui.add(['notes.pdf']);ui.review();assert.equal(ui.$('#place-order').disabled,true);
    Object.defineProperty(ui.w.document,'hidden',{value:false,configurable:true});
    available=true;ui.w.dispatchEvent(new ui.w.Event('online'));await tick();await tick();
    assert.equal(ui.$('#total-files').textContent,'1');assert.equal(ui.$('#place-order').disabled,false);
  } finally {ui.dom.window.close();}
});

test('busy shop disables student ordering while preserving existing-order access', async () => {
  const ui = await dashboard(false, { configuration: async () => ({ ordersEnabled: true }), shop: async () => ({ acceptingOrders: false }) });
  try {
    await ui.add(['report.pdf']); ui.review();
    assert.equal(ui.$('#place-order').disabled, true);
    assert.match(ui.$('#shop-availability').textContent, /not accepting new orders/);
    ui.$('[data-view=orders]').click(); await tick();
    assert.equal(ui.$('#orders-view').hidden, false);
  } finally { ui.dom.window.close(); }
});

test('placing an order opens its QR once, exposes collection code and hides shop navigation from students', async () => {
  let instructions = 0;
  const order = { id: '12345678-order', createdAt: new Date().toISOString(), status: 'accepted', paymentStatus: 'unpaid', quoteAmountPaise: 500, estimate: { amount: 5 }, files: [{ name: 'notes.pdf', settings: { copies: 1, colour: 'bw', size: 'A4', sides: 'single', range: '' } }], collectionSlot: { date: '2026-10-04', slot: 2, number: 7, startHour: 10, endHour: 11 } };
  const ui = await dashboard(false, {
    configuration: async () => ({ ordersEnabled: true, paymentsEnabled: true, paymentMode: 'manual' }),
    me: async () => ({ isOperator: false }), upload: async () => [], create: async () => ({ order }), list: async () => ({ orders: [order] }),
    manualInstructions: async () => { instructions++; return { amountPaise: 500, qr: 'data:image/png;base64,TEST', uri: 'upi://pay?pa=test%40bank', payee: { name: 'Test', upiId: 'test@bank' } }; }
  });
  try {
    await ui.add(['notes.pdf']); ui.review(); ui.$('#place-order').click(); await tick(); await tick();
    assert.equal(ui.$('#payment-dialog').open, true);
    assert.equal(ui.$('#manual-payment-fields').hidden, false);
    assert.equal(instructions, 1);
    assert.match(ui.$('#manual-upi-link').href, /^upi:\/\/pay/);
    assert.equal(ui.$('#operator-link').hidden, true); assert.equal(ui.$('#operator-nav').hidden, true);
    assert.match(ui.$('#orders-list').textContent, /Slot 2 \/ No. 007/);
    assert.match(ui.$('#orders-list').textContent, /Order placed/);
    assert.equal(ui.$('.order-timeline'), null);
  } finally { ui.dom.window.close(); }
});

test('verified operator receives both dashboard links', async () => {
  const ui = await dashboard(false, { configuration: async () => ({ ordersEnabled: true }), me: async () => ({ isOperator: true }) });
  try { assert.equal(ui.$('#operator-link').hidden, false); assert.equal(ui.$('#operator-nav').hidden, false); }
  finally { ui.dom.window.close(); }
});
test('failed live upload keeps files and shows failure instead of claiming order success', async () => {
  let created = false;
  const ui = await dashboard(false, { configuration: async () => ({ ordersEnabled: true }), upload: async () => { throw Error('Upload denied'); }, create: async () => { created = true; } });
  try {
    await ui.add(['report.pdf']); ui.review(); ui.$('#place-order').click(); await tick();
    assert.equal(created, false); assert.equal(ui.$('#total-files').textContent, '1'); assert.match(ui.$('#global-message').textContent, /Upload denied/);
    assert.equal(ui.$('#place-order').disabled, false);
  } finally { ui.dom.window.close(); }
});
test('offline orders retain online option, but require a fixed total and active provider', async () => {
  const order = { id: 'test-order', createdAt: new Date().toISOString(), status: 'ready', paymentStatus: 'unpaid', paymentPreference: 'offline', quoteAmountPaise: null, estimate: { amount: 5 }, files: [{ name: 'test.pdf', settings: { copies: 1, colour: 'bw', size: 'A4', sides: 'single', range: '' } }] };
  const ui = await dashboard(false, { configuration: async () => ({ ordersEnabled: true, paymentsEnabled: true }), list: async () => ({ orders: [order] }) });
  try {
    ui.$('[data-view=orders]').click(); await tick();
    ui.$('#orders-list .secondary-action').click(); assert.match(ui.$('#payment-message').textContent, /older order needs assistance/); assert.equal(ui.$('#start-payment').hidden, true);
    ui.$('#close-payment').click(); order.quoteAmountPaise = 500;
    ui.$('#refresh-orders').click(); await tick(); ui.$('#orders-list .secondary-action').click(); assert.equal(ui.$('#start-payment').hidden, false);
  } finally { ui.dom.window.close(); }
});
