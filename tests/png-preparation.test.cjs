const {test}=require('node:test'),assert=require('node:assert/strict');
const {PDFDocument}=require('pdf-lib'),{prepare}=require('../server/shop-print-pdf.cjs');
const defaults=require('../print-core.js').defaults;
test('PNG variants convert to valid A4 PDF without native decoding',async()=>{
 const sharp=require('sharp'),fs=require('node:fs/promises');
 const bytes=await sharp({create:{width:80,height:900,channels:4,background:{r:20,g:50,b:90,alpha:0.5}}}).png({palette:true}).toBuffer();
 const pdf=await PDFDocument.load(await prepare(bytes,'image.PNG',{...defaults,pages:1,copies:2}));
 assert.equal(pdf.getPageCount(),2);assert.ok(Math.abs(pdf.getPage(0).getWidth()-595.28)<0.1);
 // Child process deliberately rejects loading sharp; conversion must still work.
 const {execFileSync}=require('node:child_process');
 execFileSync(process.execPath,['-e',`const Module=require('module'),load=Module._load;Module._load=function(id,...args){if(id==='sharp')throw Error('native unavailable');return load.call(this,id,...args)};require('./server/shop-print-pdf.cjs').prepare(Buffer.from(process.argv[1],'base64'),'image.png',require('./print-core.js').defaults).then(b=>{if(b.subarray(0,4).toString()!=='%PDF')process.exit(1)}).catch(()=>process.exit(1));`,bytes.toString('base64')]);
});
test('invalid or oversized PNGs produce useful conversion errors',async()=>{
 await assert.rejects(prepare(Buffer.from('invalid'),'bad.png',defaults),/PNG conversion failed/);
 const header=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(header);header.write('IHDR',12);header.writeUInt32BE(100000,16);header.writeUInt32BE(100000,20);
 await assert.rejects(prepare(header,'huge.png',defaults),/25 million/);
});
