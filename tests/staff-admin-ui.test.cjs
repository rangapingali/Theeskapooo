const {test}=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom'),fs=require('node:fs');
const tick=()=>new Promise(r=>setImmediate(r));
function page(name){return new JSDOM(fs.readFileSync(name+'.html','utf8'),{url:'https://example.test/'+name+'.html',runScripts:'outside-only'});}
test('staff login gives friendly errors and retries role lookup without signing out',async()=>{
 const dom=page('staff'),w=dom.window,$=id=>w.document.getElementById(id);let user=null,failed=true;
 w.KitswAuth={current:async()=>user,login:async()=>{throw {code:'auth/invalid-credential',message:'Firebase raw internal error'}},isStaffEmail:()=>true};
 w.OrderService={me:async()=>{if(failed)throw Error('Connection interrupted');return {isOperator:true,isAdmin:true}}};
 try{w.eval(fs.readFileSync('staff.js','utf8'));await tick();$('staff-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();assert.equal($('status').textContent,'Email or password is incorrect.');
 user={email:'owner@example.test',emailVerified:true};$('staff-retry').click();await tick();assert.equal($('staff-retry').hidden,false);assert.equal($('workspaces').hidden,true);
 failed=false;$('staff-retry').click();await tick();assert.equal($('workspaces').hidden,false);assert.equal($('shop-link').hidden,false);assert.equal($('admin-link').hidden,false);assert.equal($('staff-retry').hidden,true);
 }finally{w.close()}
});
test('admin search is safe before load; refresh failure preserves last loaded orders',async()=>{
 const dom=page('admin'),w=dom.window,$=id=>w.document.getElementById(id);let release,failed=false;
 w.KitswAuth={current:()=>new Promise(r=>{release=r})};w.AbortSignal={timeout:()=>undefined};
 const overview={orders:[{id:'example-order',email:'student@example.test',status:'accepted',paymentStatus:'declared_paid',amountPaise:500,paymentPreference:'online',createdAt:'2026-10-25T03:30:00Z'}],acceptingOrders:true,operatorEmails:['owner@example.test'],paymentMode:'self_declared'};
 w.fetch=async path=>{if(failed)throw new w.TypeError('Failed to fetch');return {ok:true,json:async()=>path.endsWith('audit')?{events:[]}:overview}};
 try{w.eval(fs.readFileSync('admin.js','utf8'));assert.doesNotThrow(()=>{$('search').value='missing';$('search').dispatchEvent(new w.Event('input'))});
 const user={emailVerified:true,getIdToken:async()=> 'test-token'};release(user);await tick();await tick();assert.match($('orders').textContent,/No orders match/);$('search').value='';$('search').dispatchEvent(new w.Event('input'));assert.match($('orders').textContent,/student@example.test/);
 w.KitswAuth.current=async()=>user;failed=true;$('refresh').click();await tick();await tick();assert.equal($('admin-content').hidden,false);assert.match($('notice').textContent,/Connection interrupted/);assert.equal($('refresh').disabled,false);assert.equal($('refresh').textContent,'Refresh');
 }finally{w.close()}
});
