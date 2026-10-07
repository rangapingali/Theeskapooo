const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const tick = () => new Promise(resolve => setImmediate(resolve));

test('declaration mode removes recipient approval and allows declared-paid handover',async()=>{
  const dom=new JSDOM(fs.readFileSync(path.join(root,'operator.html'),'utf8'),{url:'http://localhost/operator.html',runScripts:'outside-only'});
  const order={id:'one',uid:'student',email:'student@kitsw.ac.in',status:'ready',paymentStatus:'declared_paid',files:[],quoteAmountPaise:500};
  let action;
  dom.window.KitswAuth={current:async()=>({uid:'operator',email:'operator@kitsw.ac.in',emailVerified:true})};
  dom.window.OrderService={me:async()=>({isOperator:true}),configuration:async()=>({paymentMode:'self_declared'}),shop:async()=>({acceptingOrders:true}),operatorOrders:async()=>({orders:[order]}),operatorAction:async(id,kind,body)=>{action=body.status;return{order:{...order,status:body.status}};}};
  try {
    dom.window.eval(fs.readFileSync(path.join(root,'operator.js'),'utf8'));await tick();
    const d=dom.window.document;
    assert.equal(d.querySelector('[data-filter=pending]').hidden,true);
    assert.equal(d.querySelector('#count-payments').closest('.panel').hidden,true);
    assert.match(d.querySelector('#operator-orders').textContent,/Declared paid/);
    assert.equal(d.querySelector('#operator-orders form'),null);
    const handover=[...d.querySelectorAll('#operator-orders button')].find(b=>b.textContent==='Confirm handed over');
    assert.equal(handover.disabled,false);handover.click();await tick();
    assert.equal(action,'collected');assert.match(d.querySelector('#operator-orders').textContent,/No orders/);
  } finally {dom.window.close();}
});
test('same-account operator UI denies unassigned access without loading other student orders', async () => {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'operator.html'), 'utf8'), { url: 'http://localhost/operator.html', runScripts: 'outside-only' });
  let calls = 0;
  dom.window.KitswAuth = { current: async () => ({ uid: 'student1', email: 'student@kitsw.ac.in', emailVerified: true }) };
  dom.window.OrderService = { me: async () => ({ isOperator: false }), operatorOrders: async () => { calls++; return { orders: [] }; } };
  try {
    dom.window.eval(fs.readFileSync(path.join(root, 'operator.js'), 'utf8')); await tick();
    assert.equal(calls, 0); assert.match(dom.window.document.querySelector('#operator-banner').textContent, /student account is active/);
    assert.match(dom.window.document.querySelector('#header-student-link').href, /dashboard.html$/);
  } finally { dom.window.close(); }
});
test('operator preview checks amount and labels simulated approval', async () => {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'operator.html'), 'utf8'), { url: 'http://localhost/operator.html?preview=1', runScripts: 'outside-only' });
  const $ = selector => dom.window.document.querySelector(selector);
  try {
    dom.window.eval(fs.readFileSync(path.join(root, 'operator.js'), 'utf8')); await tick();
    const form = $('#operator-orders form'); const amount = form.querySelector('input[type=number]'); amount.value = '1';
    form.querySelector('input[type=checkbox]').checked = true;
    form.dispatchEvent(new dom.window.Event('submit', { cancelable: true })); await tick();
    assert.match($('#operator-feedback').textContent, /does not match/);
    amount.value = '60'; form.dispatchEvent(new dom.window.Event('submit', { cancelable: true })); await tick();
    assert.match($('#operator-feedback').textContent, /No real order/);
    $('[data-filter=all]').click(); assert.match($('#operator-orders').textContent, /Paid/);
    const handover = [...dom.window.document.querySelectorAll('#operator-orders button')].find(b => b.textContent === 'Confirm handed over');
    handover.click(); await tick();
    assert.match($('#operator-orders').textContent, /No orders/);
    $('[data-filter=history]').click(); assert.match($('#operator-orders').textContent, /Collected/);
    $('#shop-toggle').click(); await tick(); assert.match($('#shop-status').textContent, /Busy/);
    assert.match($('#student-workspace').href, /preview=1/);
  } finally { dom.window.close(); }
});

test('shop availability loads even when the order queue fails', async () => {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'operator.html'), 'utf8'), { url: 'http://localhost/operator.html', runScripts: 'outside-only' });
  dom.window.KitswAuth = { current: async () => ({ uid: 'operator', email: 'b25ai163@kitsw.ac.in', emailVerified: true }) };
  dom.window.OrderService = {
    me: async () => ({ isOperator: true }),
    shop: async () => ({ acceptingOrders: true }),
    operatorOrders: async () => { throw Error('Queue connection failed'); },
    setShop: async acceptingOrders => ({ acceptingOrders })
  };
  try {
    dom.window.eval(fs.readFileSync(path.join(root, 'operator.js'), 'utf8')); await tick();
    const $ = selector => dom.window.document.querySelector(selector);
    assert.match($('#shop-status').textContent, /accepting orders/);
    assert.equal($('#shop-toggle').disabled, false);
    assert.match($('#operator-feedback').textContent, /Queue connection failed/);
    $('#shop-toggle').click(); await tick();
    assert.match($('#shop-status').textContent, /Busy/);
  } finally { dom.window.close(); }
});

test('shop actions show immediate saving feedback and reuse the confirmed order without reloading the queue',async()=>{
  const dom=new JSDOM(fs.readFileSync(path.join(root,'operator.html'),'utf8'),{url:'http://localhost/operator.html',runScripts:'outside-only'});
  let listCalls=0,finish;
  const order={id:'one',uid:'student',email:'student@kitsw.ac.in',priority:true,status:'printing',paymentStatus:'paid',reviewStatus:'approved',files:[],quoteAmountPaise:800};
  dom.window.KitswAuth={current:async()=>({uid:'operator',email:'operator@kitsw.ac.in',emailVerified:true})};
  dom.window.OrderService={me:async()=>({isOperator:true}),shop:async()=>({acceptingOrders:true}),operatorOrders:async()=>{listCalls++;return{orders:[order]};},operatorAction:()=>new Promise(r=>finish=r)};
  try{
    dom.window.eval(fs.readFileSync(path.join(root,'operator.js'),'utf8'));await tick();
    const d=dom.window.document;assert.match(d.querySelector('#operator-orders').textContent,/URGENT/);
    [...d.querySelectorAll('#operator-orders button')].find(b=>b.textContent==='Mark ready to collect').click();
    assert.match(d.querySelector('#operator-feedback').textContent,/Saving/);
    finish({order:{...order,status:'ready'}});await tick();
    assert.equal(listCalls,1);assert.match(d.querySelector('#operator-orders').textContent,/Ready to collect/);
  }finally{dom.window.close();}
});

test('offline orders can record cash and status actions carry the required student-present confirmation', async () => {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'operator.html'), 'utf8'), { url: 'http://localhost/operator.html', runScripts: 'outside-only' });
  const $ = selector => dom.window.document.querySelector(selector);
  const actions = [];
  let order = { id: 'offline-order', uid: 'student', email: 'student@kitsw.ac.in', status: 'accepted', paymentStatus: 'unpaid', paymentPreference: 'offline', offlineNumber: 42, reviewStatus: 'approved', quoteAmountPaise: 500, files: [] };
  dom.window.KitswAuth = { current: async () => ({ uid: 'operator', email: 'operator@kitsw.ac.in', emailVerified: true }) };
  dom.window.OrderService = {
    me: async () => ({ isOperator: true }),
    configuration: async () => ({ paymentMode: 'self_declared' }),
    shop: async () => ({ acceptingOrders: true }),
    operatorOrders: async () => ({ orders: [order] }),
    operatorAction: async (id, action, body) => {
      actions.push({ action, body });
      order = { ...order, ...(action === 'cash' ? { paymentStatus: 'paid', paymentMethod: 'cash', paymentReceivedMs: Date.now() } : { status: body.status }) };
      return { order };
    }
  };
  try {
    dom.window.eval(fs.readFileSync(path.join(root, 'operator.js'), 'utf8')); await tick();
    assert.equal($('#operator-orders form').hidden, false);
    const form = $('#operator-orders form');
    form.querySelector('input[type=number]').value = '5';
    form.querySelectorAll('input[type=checkbox]').forEach(input => { input.checked = true; });
    form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); await tick();
    assert.equal(actions[0].action, 'cash');
    assert.equal(actions[0].body.studentPresent, true);
    assert.equal(actions[0].body.amountPaise, 500);

    const start = [...$('#operator-orders').querySelectorAll('button')].find(button => button.textContent === 'Start printing');
    assert.equal(start.disabled, false);
    start.click(); await tick();
    assert.equal(actions.length, 1);
    assert.match($('#operator-feedback').textContent, /student is present/);
    const present = $('#operator-orders').querySelector('input[type=checkbox]');
    present.checked = true;
    [...$('#operator-orders').querySelectorAll('button')].find(button => button.textContent === 'Start printing').click(); await tick();
    assert.equal(actions[1].action, 'status');
    assert.equal(actions[1].body.status, 'printing');
    assert.equal(actions[1].body.studentPresent, true);
    [...$('#operator-orders').querySelectorAll('button')].find(button => button.textContent === 'Mark ready to collect').click(); await tick();
    assert.equal(actions[2].body.status, 'ready');
    [...$('#operator-orders').querySelectorAll('button')].find(button => button.textContent === 'Confirm handed over').click(); await tick();
    assert.equal(actions[3].body.status, 'collected');
  } finally { dom.window.close(); }
});

test('daily earnings update before shop close, include paid declarations, and exclude unpaid orders', async () => {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'operator.html'), 'utf8'), { url: 'http://localhost/operator.html', runScripts: 'outside-only' });
  const NativeDate = dom.window.Date;
  const fixedNow = NativeDate.parse('2026-10-06T11:45:00.000Z');
  dom.window.Date = class extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [fixedNow])); }
    static now() { return fixedNow; }
  };
  const todayPaid = [
    { id: 'today-one', uid: 'student', email: 'student@example.com', status: 'collected', files: [], paymentStatus: 'paid', paymentReceivedMs: NativeDate.parse('2026-10-06T08:00:00.000Z'), quoteAmountPaise: 750, paymentMethod: 'cash' },
    { id: 'today-two', uid: 'student', email: 'student@example.com', status: 'collected', files: [], paymentStatus: 'paid', paymentReceivedMs: NativeDate.parse('2026-10-06T11:30:00.000Z'), quoteAmountPaise: 500, paymentMethod: 'manual_upi' },
    { id: 'student-declared', uid: 'student', email: 'student@example.com', status: 'collected', files: [], paymentStatus: 'declared_paid', paymentReceivedMs: NativeDate.parse('2026-10-06T11:00:00.000Z'), quoteAmountPaise: 900 },
    { id: 'unpaid-today', uid: 'student', email: 'student@example.com', status: 'accepted', files: [], paymentStatus: 'unpaid', quoteAmountPaise: 9999 },
    { id: 'yesterday', uid: 'student', email: 'student@example.com', status: 'collected', files: [], paymentStatus: 'paid', paymentReceivedMs: NativeDate.parse('2026-10-05T12:00:00.000Z'), quoteAmountPaise: 1200 },
    { id: 'india-date-boundary', uid: 'student', email: 'student@example.com', status: 'collected', files: [], paymentStatus: 'paid', paymentReceivedMs: NativeDate.parse('2026-10-04T22:00:00.000Z'), quoteAmountPaise: 300 },
    { id: 'two-days-ago', uid: 'student', email: 'student@example.com', status: 'collected', files: [], paymentStatus: 'paid', paymentReceivedMs: NativeDate.parse('2026-10-04T12:00:00.000Z'), quoteAmountPaise: 2500 },
    { id: 'outside-seven-days', uid: 'student', email: 'student@example.com', status: 'collected', files: [], paymentStatus: 'paid', paymentReceivedMs: NativeDate.parse('2026-09-28T18:29:00.000Z'), quoteAmountPaise: 5000 }
  ];
  dom.window.KitswAuth = { current: async () => ({ uid: 'operator', email: 'operator@kitsw.ac.in', emailVerified: true }) };
  dom.window.OrderService = {
    me: async () => ({ isOperator: true }),
    shop: async () => ({ acceptingOrders: true }),
    operatorOrders: async () => ({ orders: todayPaid })
  };
  try {
    dom.window.eval(fs.readFileSync(path.join(root, 'operator.js'), 'utf8'));
    await tick();
    const $ = selector => dom.window.document.querySelector(selector);
    assert.equal($('#daily-earnings').hidden, false);
    assert.equal($('#daily-earnings-total').textContent, '₹21.50');
    assert.equal($('#daily-earnings-count').textContent, '3');
    assert.match($('#daily-earnings-orders').textContent, /TODAY-ON/);
    assert.match($('#daily-earnings-orders').textContent, /TODAY-TW/);
    assert.match($('#daily-earnings-orders').textContent, /STUDENT-4/);
    assert.doesNotMatch($('#daily-earnings-orders').textContent, /YESTERDAY/);
    assert.equal($('#earnings-history').hidden, false);
    const historyDays = [...$('#earnings-history-days').children];
    assert.equal(historyDays.length, 7);
    const yesterday = historyDays.find(day => day.dataset.date === '2026-10-05');
    assert.match(yesterday.textContent, /₹15\.00/);
    assert.match(yesterday.textContent, /2 payments marked paid/);
    const twoDaysAgo = historyDays.find(day => day.dataset.date === '2026-10-04');
    assert.match(twoDaysAgo.textContent, /₹25\.00/);
    assert.match(historyDays.find(day => day.dataset.date === '2026-09-29').textContent, /₹0\.00/);
    assert.doesNotMatch(historyDays.map(day => day.textContent).join(' '), /₹50\.00/);
  } finally { dom.window.close(); }
});

test('orders past their pickup slot leave the active queue and stay in history', async () => {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'operator.html'), 'utf8'), { url: 'http://localhost/operator.html', runScripts: 'outside-only' });
  const NativeDate = dom.window.Date;
  const fixedNow = NativeDate.parse('2026-10-06T11:00:00.000Z');
  dom.window.Date = class extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [fixedNow])); }
    static now() { return fixedNow; }
  };
  const order = (id, endHour) => ({ id, uid: 'student', email: 'student@example.com', status: 'accepted', paymentStatus: 'paid', files: [], quoteAmountPaise: 500, collectionSlot: { date: '2026-10-06', startHour: endHour - 1, endHour, slot: endHour - 8, number: 1 } });
  dom.window.KitswAuth = { current: async () => ({ uid: 'operator', email: 'operator@kitsw.ac.in', emailVerified: true }) };
  dom.window.OrderService = { me: async () => ({ isOperator: true }), shop: async () => ({ acceptingOrders: true }), operatorOrders: async () => ({ orders: [order('expired-slot', 16), order('active-slot', 18)] }) };
  try {
    dom.window.eval(fs.readFileSync(path.join(root, 'operator.js'), 'utf8'));
    await tick();
    const d = dom.window.document;
    assert.equal(d.querySelector('#count-active').textContent, '1');
    assert.match(d.querySelector('#operator-orders').textContent, /ACTIVE-S/);
    assert.doesNotMatch(d.querySelector('#operator-orders').textContent, /EXPIRED-/);
    d.querySelector('[data-filter=history]').click();
    assert.match(d.querySelector('#operator-orders').textContent, /EXPIRED-/);
    assert.match(d.querySelector('#operator-orders').textContent, /Pickup slot passed/);
    assert.equal(d.querySelector('#operator-orders').querySelector('button'), null);
  } finally { dom.window.close(); }
});

test('daily earnings remain visible before 5:30 PM IST', async () => {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'operator.html'), 'utf8'), { url: 'http://localhost/operator.html', runScripts: 'outside-only' });
  const NativeDate = dom.window.Date;
  const fixedNow = NativeDate.parse('2026-10-06T11:59:00.000Z');
  dom.window.Date = class extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [fixedNow])); }
    static now() { return fixedNow; }
  };
  dom.window.KitswAuth = { current: async () => ({ uid: 'operator', email: 'operator@kitsw.ac.in', emailVerified: true }) };
  dom.window.OrderService = { me: async () => ({ isOperator: true }), shop: async () => ({ acceptingOrders: true }), operatorOrders: async () => ({ orders: [] }) };
  try {
    dom.window.eval(fs.readFileSync(path.join(root, 'operator.js'), 'utf8'));
    await tick();
    assert.equal(dom.window.document.querySelector('#daily-earnings').hidden, false);
    assert.equal(dom.window.document.querySelector('#earnings-history').hidden, false);
  } finally { dom.window.close(); }
});
