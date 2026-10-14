const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const core=require('../print-core.js');
const {validateOrder}=require('../server/order-validation.cjs');
test('shop policy enforces PDF/PNG, colour PDF and A4 independently of browser controls',()=>{
 const id='11111111-1111-1111-1111-111111111111',fileId='22222222-2222-2222-2222-222222222222';
 const order={id,shop:'campus',paymentPreference:'online',notes:'',pickupTime:null,files:[]};
 const make=(ext,settings={})=>({...order,files:[{name:'notes.'+ext,size:10,path:`student-uploads/u/${id}/${fileId}.${ext}`,settings:{...core.defaults,...settings}}]});
 assert.equal(validateOrder(make('pdf'),'u').estimate.amount,5);
 const legacy=make('pdf');delete legacy.files[0].settings.duplexEdge;delete legacy.files[0].settings.collate;
 assert.equal(validateOrder(legacy,'u').files[0].settings.collate,'on');
 assert.equal(validateOrder(make('pdf',{colour:'colour'}),'u').estimate.amount,10);
 assert.equal(validateOrder(make('png'),'u').estimate.amount,5);
 assert.throws(()=>validateOrder(make('png',{colour:'colour'}),'u'),/Canon requires PDF/);
 for(const ext of ['docx','pptx','jpg','txt'])assert.throws(()=>validateOrder(make(ext),'u'),/PDF and PNG only/);
 for(const size of ['A3','Legal','Letter'])assert.throws(()=>validateOrder(make('pdf',{size}),'u'),/Only A4/);
});
test('phone print handoff requires an authenticated fetch and a separate share gesture; it never updates orders',async()=>{
 const dom=new JSDOM('',{url:'https://example.test',runScripts:'outside-only'}),w=dom.window;
 let requests=[],shares=[];
 w.AbortSignal={timeout:()=>undefined};w.KitswAuth={current:async()=>({emailVerified:true,getIdToken:async()=>'test-token'})};
 w.fetch=async(url,options)=>{requests.push({url,options});return{ok:true,blob:async()=>new w.Blob(['pdf'])};};
 w.navigator.canShare=({files})=>files[0].type==='application/pdf';
 w.navigator.share=async data=>{shares.push(data);};
 w.eval(fs.readFileSync('order-service.js','utf8'));
 try{
  const send=await w.OrderService.preparePrintShare('order',0,'notes.pdf');
  assert.equal(shares.length,0);assert.equal(requests[0].options.headers.Authorization,'Bearer test-token');
  await send();assert.equal(shares.length,1);assert.equal(shares[0].files[0].name,'prepared-notes.pdf');assert.equal(requests.length,1);assert.match(requests[0].url,/prepared=1$/);
  await assert.rejects(w.OrderService.preparePrintShare('order',0,'notes.docx'),/PDF or PNG/);
  w.navigator.canShare=()=>false;await assert.rejects(w.OrderService.preparePrintShare('order',0,'notes.pdf'),/Download document/);
  w.fetch=async()=>({ok:false,json:async()=>null});await assert.rejects(w.OrderService.preparePrintShare('order',0,'notes.pdf'),/could not be opened/);
  w.fetch=async()=>({ok:false,json:async()=>({error:'Flatten this PDF first.'})});await assert.rejects(w.OrderService.preparePrintShare('order',0,'notes.pdf'),/Flatten/);
 }finally{w.close();}
});
