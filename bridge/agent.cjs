const http=require('node:http'),crypto=require('node:crypto'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');const run=promisify(execFile);
const {layout}=require('./layout.cjs');
function settings(s){return ['paper=A4','monochrome','1x','fit',s.sides==='double'?'duplexlong':'simplex'].join(',');}
function createAgent({origin,pairing,redeem,print}) {
 let busy=false;
 const server=http.createServer(async(req,res)=>{
  const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  if(req.headers.host!=='127.0.0.1:'+server.address().port||req.headers.origin!==origin)return reply(403,{error:'Unpaired website.'});
  res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');
  if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Methods','POST');res.setHeader('Access-Control-Allow-Headers','Content-Type,X-Bridge-Key');res.setHeader('Access-Control-Allow-Private-Network','true');return reply(200,{});}
  const key=Buffer.from(req.headers['x-bridge-key']||'');const expected=Buffer.from(pairing);
  if(key.length!==expected.length||!crypto.timingSafeEqual(key,expected))return reply(403,{error:'Pairing code does not match. Restart pairing.'});
  if(req.method!=='POST'||req.url!=='/print')return reply(404,{error:'Not found.'});
  if(busy)return reply(409,{error:'Bridge is busy. Wait for the current job.'});
  busy=true;let directory;
  try{
   let body='';for await(const chunk of req){body+=chunk;if(body.length>2048)throw Error('Request too large.');}
   const request=JSON.parse(body);
   if(!/^[a-f0-9-]{36}$/.test(request.id)||!Number.isInteger(request.index)||request.index<0||request.index>9||!/^[a-f0-9]{64}$/.test(request.ticket))throw Error('Invalid ticket.');
   const job=await redeem(request);
   if(typeof job.bytes!=='string'||job.bytes.length>36*1024*1024)throw Error('Invalid print document.');
   const pdf=await layout(Buffer.from(job.bytes,'base64'),job.name,job.settings);
   directory=await fs.mkdtemp(path.join(os.tmpdir(),'theeskapooo-print-'));
   const file=path.join(directory,'print.pdf');await fs.writeFile(file,pdf,{mode:0o600});
   await print(file,settings(job.settings));
   reply(200,{message:'Submitted to Brother through Windows. Check the physical pages before marking ready. Do not resend if the printer is paused.'});
  }catch(error){
   const detail=/^(Flatten PDF|Unsupported Brother|Document page count|Home test limit|Invalid page range|Page range exceeds|PNG must|Only PDF)/.test(error.message||'')?error.message:'Printing was not confirmed.';
   reply(409,{error:detail+' Check the Windows queue before any manual reprint; the one-use ticket may already be consumed.'});
   console.error(detail+' Check Windows queue before any manual reprint.');
  }
  finally{if(directory)await fs.unlink(path.join(directory,'print.pdf')).then(()=>fs.rmdir(directory)).catch(()=>console.error('Temporary file cleanup failed. Remove the theeskapooo-print folder in your Windows TEMP directory.'));busy=false;}
 });
 return server;
}
async function main(){
 if(process.platform!=='win32')throw Error('This bridge requires Windows.');
 const origin=new URL(process.env.BRIDGE_SITE).origin;
 if(!origin.startsWith('https://'))throw Error('BRIDGE_SITE must be your HTTPS test deployment.');
 const printer=process.env.BRIDGE_PRINTER||'Brother HL-L2321D series',exe=process.env.SUMATRA_EXE;
 if(!/Brother.*HL-L2321D/i.test(printer)||!exe||!path.isAbsolute(exe)||path.basename(exe).toLowerCase()!=='sumatrapdf.exe')throw Error('Set the exact Brother printer name and absolute SUMATRA_EXE path.');
 await fs.access(exe);
 const result=await run('powershell.exe',['-NoProfile','-NonInteractive','-Command','Get-Printer | Select-Object -ExpandProperty Name'],{windowsHide:true,timeout:15000});
 if(!result.stdout.split(/\r?\n/).map(s=>s.trim()).includes(printer))throw Error('Brother driver not installed under BRIDGE_PRINTER. Check Windows Printers & scanners.');
 const pairing=crypto.randomBytes(24).toString('hex');
 const server=createAgent({origin,pairing,
  redeem:async({id,index,ticket})=>{const response=await fetch(origin+'/api/brother/redeem',{method:'POST',headers:{Authorization:'Bearer '+ticket,'Content-Type':'application/json'},body:JSON.stringify({id,index}),signal:AbortSignal.timeout(60000),redirect:'error'});if(!response.ok)throw Error('Ticket refused.');return response.json();},
  print:(file,options)=>run(exe,['-print-to',printer,'-print-settings',options,'-silent',file],{windowsHide:true,timeout:120000})
 });
 server.requestTimeout=150000;server.headersTimeout=10000;
 server.listen(4179,'127.0.0.1',()=>{console.log('Brother bridge ready for '+origin);console.log('Pairing code (enter only in your operator page): '+pairing);console.log('Keep this terminal open. Ctrl+C stops the bridge.');});
 server.on('error',()=>{console.error('Cannot open bridge port 4179. Close the existing bridge first.');process.exitCode=1;});
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={createAgent,settings};
