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
