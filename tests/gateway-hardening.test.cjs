const {test}=require('node:test'),assert=require('node:assert/strict');
const {assertCaptured,requireVerifiedPrintPayment}=require('../server/payment-security.cjs');
test('gateway printing refuses legacy declarations and unverifiable paid records',()=>{
 for(const mode of ['test','live'])for(const order of [{paymentStatus:'declared_paid'},{paymentStatus:'paid'},{paymentStatus:'paid',paymentMethod:'manual_upi'},{paymentStatus:'paid',paymentMethod:'cash'}])assert.throws(()=>requireVerifiedPrintPayment(order,mode),/Verified payment/);
 assert.doesNotThrow(()=>requireVerifiedPrintPayment({paymentStatus:'declared_paid'},'self_declared'));
 assert.doesNotThrow(()=>requireVerifiedPrintPayment({paymentStatus:'paid',paymentMethod:'cash',paymentConfirmedBy:'operator'},'live'));
 const paid={paymentStatus:'paid',paymentVerification:'gateway_api',paymentId:'pay_123'};
 assert.doesNotThrow(()=>requireVerifiedPrintPayment(paid,'live'));
 assert.throws(()=>requireVerifiedPrintPayment({...paid,paymentReconciliationRequired:true},'live'));
});
test('malformed amounts and missing refund fields fail captured-payment verification',()=>{
 const order={providerOrderId:'order_123',quoteAmountPaise:500};const payment={order_id:'order_123',amount:500,amount_refunded:0,currency:'INR',status:'captured',captured:true};
 for(const amount_refunded of [undefined,null,-1,'0',1])assert.throws(()=>assertCaptured({...payment,amount_refunded},order));
 for(const amount of [undefined,NaN,500.1,'500'])assert.throws(()=>assertCaptured({...payment,amount},order));
 assert.throws(()=>assertCaptured(null,order));assert.throws(()=>assertCaptured(payment,{}));
});

test('captured payment commits once and refuses changed prices or receipt reuse',async()=>{
 const fs=require('node:fs'),vm=require('node:vm');const source=fs.readFileSync(require.resolve('../server/index.cjs'),'utf8');
 const records=new Map(),orderRef={id:'local-order',key:'order'},payment={id:'pay_123',order_id:'order_123',amount:500,amount_refunded:0,currency:'INR',status:'captured',captured:true};
 const db={collection:name=>({doc:id=>({key:name+'/'+id})}),runTransaction:async fn=>{const next=new Map([...records].map(([k,v])=>[k,{...v}]));await fn({get:async r=>({exists:next.has(r.key),data:()=>next.get(r.key)}),set:(r,v)=>next.set(r.key,v),update:(r,v)=>next.set(r.key,{...next.get(r.key),...v})});records.clear();for(const [k,v]of next)records.set(k,v);}};
 const context={db,paymentMode:'live',assertCaptured,FieldValue:{serverTimestamp:()=>123},failure:(httpStatus,message)=>Object.assign(Error(message),{httpStatus})};vm.createContext(context);vm.runInContext(source.slice(source.indexOf('async function markPaid('),source.indexOf('// Raw bytes must')),context);
 const order={providerOrderId:'order_123',lockedAmountPaise:500,quoteAmountPaise:500,status:'accepted',paymentStatus:'unpaid'};records.set('order',order);
 await context.markPaid(orderRef,payment);assert.equal(records.get('order').paymentVerification,'gateway_api');await context.markPaid(orderRef,payment);assert.equal(records.size,2);
 records.set('order',{...order,quoteAmountPaise:600});await assert.rejects(context.markPaid(orderRef,payment),/total changed/);
 records.set('order',order);records.set('verifiedPayments/pay_123',{orderId:'different'});await assert.rejects(context.markPaid(orderRef,payment),/another order/);
 records.delete('verifiedPayments/pay_123');records.set('order',{...order,status:'cancelled'});await context.markPaid(orderRef,payment);assert.equal(records.get('order').paymentReconciliationRequired,true);assert.equal(records.get('order').status,'cancelled');
});
