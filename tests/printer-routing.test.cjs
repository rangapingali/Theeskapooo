const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
test('operator routing uses printed sides, allows override, and keeps manual controls collapsed',async()=>{
 const dom=new JSDOM(fs.readFileSync('operator.html','utf8'),{url:'https://example.test/operator.html',runScripts:'outside-only'}),w=dom.window;
 w.setInterval=()=>0;Object.defineProperty(w.navigator,'userAgent',{value:'Android'});
 const defaults=require('../print-core.js').defaults;
 const files=[{name:'large.pdf',settings:{...defaults,pages:80,layout:4}},{name:'small.pdf',settings:{...defaults,pages:30,range:'1-5'}},{name:'colour.pdf',settings:{...defaults,colour:'colour',sides:'double'}}];
 let submitted;
 w.KitswAuth={current:async()=>({uid:'operator',email:'operator@kitsw.ac.in',emailVerified:true})};
 w.OrderService={me:async()=>({isOperator:true}),configuration:async()=>({paymentMode:'self_declared'}),shop:async()=>({acceptingOrders:true}),operatorOrders:async()=>({orders:[{id:'11111111-1111-1111-1111-111111111111',uid:'student',status:'accepted',paymentStatus:'paid',files,quoteAmountPaise:12500}]}),mobilePrint:async(id,index,printer)=>{submitted={index,printer};return{id,index,ticket:'a'.repeat(64)};}};
 try{
  w.eval(fs.readFileSync('print-core.js','utf8'));w.eval(fs.readFileSync('operator.js','utf8'));await new Promise(r=>setImmediate(r));
  const cards=[...w.document.querySelectorAll('.operator-file')];assert.equal(cards[0].querySelector('select').value,'kyocera-new');assert.equal(cards[1].querySelector('select').value,'kyocera-old');assert.equal(cards[2].querySelector('select').value,'canon');
  assert.equal(cards[0].querySelector('details').open,false);
  const choice=cards[0].querySelector('select');choice.value='kyocera-old';choice.dispatchEvent(new w.Event('change'));
  [...cards[0].querySelectorAll('button')].find(b=>b.textContent==='Print with Android helper').click();await new Promise(r=>setImmediate(r));assert.deepEqual(submitted,{index:0,printer:'kyocera-old'});
  assert.ok([...cards[2].querySelectorAll('button')].some(b=>b.disabled&&b.textContent.includes('Colour duplex')));
 }finally{w.close();}
});
