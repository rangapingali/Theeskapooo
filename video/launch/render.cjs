/* Reproducible product film. All screens are illustrative, with fictional data. */
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const sharp = require('sharp');
const QRCode = require('qrcode');
const ffmpeg = require('ffmpeg-static');
const root = path.resolve(__dirname, '../..');
const build = path.join(__dirname, 'build');
const output = path.join(__dirname, 'output');
const W = 1920, H = 1080, FPS = 30;
const C = { dark:'#103b2e', green:'#214f3c', muted:'#6d7e72', cream:'#fffbed', pale:'#edf3e6', coral:'#ef8057', yellow:'#ffd36b', white:'#ffffff' };
let assets = {};
const esc = x => String(x).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function rect(x,y,w,h,fill,rx=16,stroke='none',sw=1) { return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`; }
function text(x,y,value,size=20,fill=C.green,weight=400,extra='') { return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" ${extra}>${esc(value)}</text>`; }
function lines(x,y,list,size=20,fill=C.green,weight=400,gap=size*1.3) { return list.map((s,i)=>text(x,y+i*gap,s,size,fill,weight)).join(''); }
function img(key,x,y,w,h) { return `<image href="${assets[key]}" x="${x}" y="${y}" width="${w}" height="${h}"/>`; }
function pill(x,y,label,fill=C.pale,ink=C.green,w=150) { return rect(x,y,w,34,fill,17)+text(x+w/2,y+23,label,14,ink,700,'text-anchor="middle"'); }
function button(x,y,w,label,fill=C.green,ink=C.white) { return rect(x,y,w,48,fill,12)+text(x+w/2,y+31,label,18,ink,600,'text-anchor="middle"'); }
function field(x,y,w,label,value,active=false) { return text(x,y,label,15,C.muted,600)+rect(x,y+12,w,48,active?'#f7fbf1':'#f8faf5',10,active?C.green:'#dbe3d6',active?2:1)+text(x+16,y+43,value,19,C.green,600); }
function paper(x,y,scale=1,angle=0) { return `<g transform="translate(${x} ${y}) rotate(${angle}) scale(${scale})">`+rect(0,0,130,170,C.cream,13)+rect(18,25,57,11,C.coral,4)+[54,72,90].map((v,i)=>rect(18,v,i===2?63:93,6,'#bac9af',3)).join('')+rect(18,116,93,33,C.pale,5)+`</g>`; }
function app(title,badge='STUDENT WORKSPACE') {
 return rect(440,128,792,454,'#051f18',24)+rect(430,118,792,454,C.white,22)+rect(430,118,792,54,'#f0f5ea',22)+rect(430,150,792,23,'#f0f5ea',0)+text(455,152,'THEESKAPOOO',16,C.green,800)+text(1196,152,badge,12,C.muted,600,'text-anchor="end"')+text(464,219,title,29,C.green,700);
}
function cursor(x,y) { return `<circle cx="${x+5}" cy="${y+9}" r="27" fill="${C.coral}" opacity=".14"/><path d="M${x} ${y}v25l7-6 6 12 7-4-7-12 10-2z" fill="${C.coral}" stroke="white" stroke-width="2"/>`; }
const descriptions = {
 login:{k:'01 / SIGN IN',h:['Your campus.','Your account.'],d:['A verified college email.','A workspace of your own.'],foot:'One login. A simpler print day.'},
 upload:{k:'02 / ADD YOUR FILE',h:['Pages counted.','Automatically.'],d:['PDFs and supported images.','No manual page counting.'],foot:'Office document? Export to PDF first.'},
 settings:{k:'03 / MAKE IT YOURS',h:['Your print.','Your way.'],d:['Copies. Colour. Paper size.','A fixed total as you choose.'],foot:'B&W ₹5 · Colour ₹10 / printed side'},
 payment:{k:'04 / PLACE & PAY',h:['Place it.','Pay your way.'],d:['UPI on your phone.','Or cash at collection.'],foot:'Online payments need recipient confirmation.'},
 slot:{k:'05 / FIND YOUR PRINT',h:['A place for','every print.'],d:['One date. One hourly slot.','One number within that slot.'],foot:'Assigned from order time, in IST.'},
 shop:{k:'06 / BEHIND THE COUNTER',h:['The counter,','under control.'],d:['Clear orders. Print settings.','Payments and collections.'],foot:'Shop access is for authorised operators.'},
 collect:{k:'07 / PICK UP & GO',h:['Ready.','Set. Collect.'],d:['Look for “Ready to collect”.','Bring your collection code.'],foot:'After handover, find it in History.'}
};
function background(id,idx) {
 let s=`<defs><radialGradient id="glow"><stop stop-color="#286048"/><stop offset="1" stop-color="${C.dark}"/></radialGradient></defs>`+rect(0,0,1280,720,C.dark,0)+`<ellipse cx="1020" cy="250" rx="660" ry="540" fill="url(#glow)"/><circle cx="1100" cy="-60" r="410" fill="none" stroke="#b4cea1" opacity=".10"/><circle cx="1100" cy="-60" r="455" fill="none" stroke="#b4cea1" opacity=".08"/>`;
 s+=rect(48,26,226,59,C.cream,15)+img('logo',61,32,200,47)+text(1230,54,'TECH TITANS  /  PRODUCT FILM',13,'#c4d4bd',600,'text-anchor="end" letter-spacing="1.3"');
 if (descriptions[id]) { const d=descriptions[id]; s+=text(52,176,d.k,13,C.yellow,700,'letter-spacing="1.6"')+lines(48,247,d.h,43,C.cream,700,54)+lines(52,380,d.d,20,'#d0ddc9',400,30)+rect(52,459,45,4,C.coral,2)+lines(52,499,wrap(d.foot,33),14,'#b5cbb0',400,22); }
 s+=Array.from({length:9},(_,i)=>rect(52+i*31,605,i===idx?30:10,5,i===idx?C.yellow:'#6b8a6a',3)).join('');
 s+=text(52,701,'ILLUSTRATIVE WORKFLOW · DEMO DATA',10,'#a6bda1',500,'letter-spacing="1"')+text(1230,701,`${String(idx+1).padStart(2,'0')} / 09`,11,'#a6bda1',600,'text-anchor="end"');
 return s;
}
function wrap(value,max=62) { let rows=['']; for(const word of value.split(' ')){ const n=rows.length-1;if((rows[n]+' '+word).trim().length>max) rows.push(word);else rows[n]+=(rows[n]?' ':'')+word; }return rows; }
function ui(id,state) {
 let s='';
 if(id==='intro') {
  s+=paper(75,238,.87,-13)+paper(1090,270,.86,14)+rect(278,168,736,197,C.cream,32)+img('logo',316,185,660,161);
  s+=text(640,434,state?'More campus life.':'A little less waiting.',53,C.cream,700,'text-anchor="middle"')+text(640,482,'Your documents. Your settings. Your time.',25,'#d7e2d0',400,'text-anchor="middle"');
  s+=pill(438,525,'UPLOAD',C.yellow,C.green,117)+pill(581,525,'PRINT',C.pale,C.green,117)+pill(724,525,'PICK UP',C.coral,C.dark,117);
 } else if(id==='login') {
  s+=app('Welcome back.','COLLEGE SIGN IN')+img('college',1103,191,67,67)+text(465,250,'Kakatiya Institute of Technology & Science',15,C.muted,500);
  s+=field(465,292,718,'College email address',state?'student@kitsw.ac.in':'Your college email',!!state)+field(465,387,718,'THEESKAPOOO password',state?'••••••••••••':'Your app password');
  s+=button(465,485,718,'Log in  →')+(state?cursor(1090,502):'');
 } else if(id==='upload') {
  s+=app('Your documents')+rect(465,245,718,128,'#f4f8ee',15,C.green,1)+text(824,286,'↑',38,C.green,500,'text-anchor="middle"')+text(824,324,'Drop your files here, or browse files',22,C.green,600,'text-anchor="middle"')+text(824,351,'PDF & supported images · Automatic page counting',15,C.muted,400,'text-anchor="middle"');
  s+=rect(465,393,718,120,'#fafbf7',13,'#d9e1d4')+rect(484,414,66,76,C.cream,10)+text(517,459,'PDF',17,C.coral,800,'text-anchor="middle"')+text(570,438,'Assignment.pdf',22,C.green,700)+text(570,472,'A4 · 1 document · 1.2 MB',16,C.muted);
  s+=pill(963,425,state?'12 pages detected':'Counting pages…',state?C.pale:'#fff0d8',C.green,199)+text(1183,543,state?'✓ Ready for print settings':'Reading the document…',15,C.muted,500,'text-anchor="end"');
  if(state) s+=cursor(1140,462);
 } else if(id==='settings') {
  s+=app('Make it your way')+field(465,258,196,'Detected pages','12',state===0)+field(682,258,196,'Copies','1')+field(465,352,196,'Print colour','Black & white',state===1)+field(682,352,196,'Paper size','A4')+field(465,446,196,'Print sides','Double-sided')+field(682,446,196,'Page range','All 12 pages');
  s+=rect(901,247,282,290,C.pale,18)+text(925,284,'Your print summary',21,C.green,700)+text(925,325,'12 printed sides',17,C.green)+text(925,357,'6 sheets · 1 copy',17,C.muted)+rect(925,384,233,1,'#c7d6bd',0)+text(925,418,'ORDER TOTAL',12,C.muted,700,'letter-spacing="1"')+text(925,481,'₹60',59,C.green,800)+text(925,516,'12 sides × ₹5',16,C.muted);
  if(state===2) s+=cursor(1120,455);
 } else if(id==='payment') {
  s+=app(state===2?'Payment confirmation':'Order placed. Choose how to pay.');
  s+=rect(465,245,252,288,'#f8faf5',18)+img('qr',481,259,220,220)+rect(531,336,120,48,C.white,8,C.green,2)+text(591,367,'DEMO',23,C.green,800,'text-anchor="middle"')+text(591,514,'Not a payment code',14,C.muted,600,'text-anchor="middle"');
  s+=text(748,275,'Order total',16,C.muted,600)+text(748,325,'₹60',46,C.green,800);
  if(state<2) s+=button(748,350,435,'Choose an installed UPI app')+button(748,414,435,'Pay at collection',C.pale,C.green)+lines(749,495,['On a laptop? Scan with your phone.','App links depend on your device.'],15,C.muted,400,24)+(state===1?cursor(1117,372):'');
  else s+=pill(748,353,'Pending confirmation','#fff0d8',C.green,291)+lines(748,422,['1. Student submits transaction reference','2. Recipient checks actual receipt','3. Payment is marked paid'],17,C.green,500,35);
 } else if(id==='slot') {
  s+=app('Your collection code')+text(466,255,'Order placed · 05 OCT 2026 · 10:24 AM IST',16,C.muted,500);
  s+=rect(465,281,345,186,C.pale,19)+text(490,319,'HOURLY SLOT',14,C.muted,700,'letter-spacing="1"')+text(490,404,'02',85,C.green,800)+text(490,440,'10:00–11:00 AM',19,C.green,600);
  s+=rect(831,281,352,186,C.yellow,19)+text(856,319,'NUMBER IN SLOT',14,C.green,700,'letter-spacing="1"')+text(856,413,'037',91,C.green,800);
  s+=text(466,512,'05 OCT 2026  /  SLOT 02  /  NUMBER 037',21,C.green,700)+text(466,543,'Collection code identifies your prints; wait for “Ready to collect”.',14,C.muted);
  if(state) s+=cursor(1100,405);
 } else if(id==='shop') {
  s+=app('Your print counter.','OPERATOR WORKSPACE')+pill(994,190,state?'New orders paused':'Accepting orders',state?'#fff0d8':C.pale,C.green,191);
  s+=rect(465,244,718,272,'#f9fbf5',16,C.green,1)+pill(485,261,'SLOT 02 · #037',C.yellow,C.green,183)+text(1162,285,'05 OCT 2026',14,C.muted,600,'text-anchor="end"')+text(485,336,'Assignment.pdf',27,C.green,700)+text(485,372,'12 pages · 1 copy · B&W · A4 · Double-sided',19,C.green,500)+text(485,406,'₹60 total  ·  Payment confirmed by recipient',17,C.muted,500)+button(485,442,227,'Download document',C.pale,C.green)+button(733,442,429,state?'Ready to collect  ✓':'Start printing');
  s+=text(467,546,state?'Students see that new orders are paused. Existing orders continue.':'Documents, settings, payments and collection codes — together.',14,C.muted);
  if(state) s+=cursor(1095,461);
 } else if(id==='collect') {
  s+=app(state?'Collected. A little more time for you.':'My orders');
  if(!state) {
   s+=rect(465,246,718,273,C.pale,20)+pill(488,268,'Ready to collect',C.green,C.white,207)+text(487,349,'Assignment.pdf',29,C.green,700)+text(487,387,'05 OCT 2026  /  SLOT 02  /  #037',23,C.green,700)+text(487,425,'₹60 · Paid',19,C.muted,600)+button(487,455,291,'Bring this code to the shop',C.yellow,C.green)+img('icon',1030,318,120,120);
  } else {
   s+=pill(465,242,'History',C.green,C.white,116)+rect(465,299,718,188,'#f8faf5',18,'#dbe4d4')+text(492,341,'Assignment.pdf',27,C.green,700)+pill(976,315,'Collected',C.pale,C.green,176)+text(492,384,'05 OCT 2026 · Slot 02 · #037',20,C.muted)+text(492,449,'Removed from the active queue. Saved in history.',19,C.green,600)+text(466,535,'Your next print is just an upload away.',19,C.green,600);
  }
 } else if(id==='outro') {
  s+=rect(275,155,738,189,C.cream,30)+img('logo',310,170,665,162)+text(640,416,'PRINT. PICK UP. POOO!',50,C.cream,800,'text-anchor="middle" letter-spacing="1"')+text(640,459,'Built for campus life.',25,'#d0dfc8',400,'text-anchor="middle"');
  s+=rect(522,499,236,73,'#edf4e6',16)+img('team',541,511,199,49);
 }
 return s;
}
function svg(body) { return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 1280 720"><g font-family="Segoe UI,Arial,sans-serif">${body}</g></svg>`; }
async function png(body,file) { await sharp(Buffer.from(svg(body))).png().toFile(file); }
function readWav(b) {
 if(b.toString('ascii',0,4)!=='RIFF') throw Error('Invalid narration WAV');
 let fmt,data;
 for(let o=12;o+8<=b.length;) {let id=b.toString('ascii',o,o+4),n=b.readUInt32LE(o+4);if(id==='fmt ')fmt=b.subarray(o+8,o+8+n);if(id==='data')data=b.subarray(o+8,o+8+n);o+=8+n+(n%2);}
 if(!fmt||!data||fmt.readUInt16LE(0)!==1||fmt.readUInt16LE(14)!==16)throw Error('Expected PCM16 WAV');
 const channels=fmt.readUInt16LE(2),rate=fmt.readUInt32LE(4),count=data.length/2/channels;
 const samples=new Float32Array(count);for(let i=0;i<count;i++)samples[i]=data.readInt16LE(i*channels*2)/32768;
 return {samples,rate,duration:count/rate};
}
function writeWav(samples,rate,channels=2) { const b=Buffer.alloc(44+samples.length*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(channels,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*channels*2,28);b.writeUInt16LE(channels*2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(samples.length*2,40);for(let i=0;i<samples.length;i++)b.writeInt16LE(Math.round(Math.max(-1,Math.min(1,samples[i]))*32767),44+i*2);return b; }
function stamp(t,ass=false){let n=Math.round(t*(ass?100:1000)),ms=n%(ass?100:1000);n=Math.floor(n/(ass?100:1000));const s=n%60,m=Math.floor(n/60)%60,h=Math.floor(n/3600);return `${ass?h:String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}${ass?'.':','}${String(ms).padStart(ass?2:3,'0')}`;}
async function exec(args) { await new Promise((resolve,reject)=>{const child=spawn(ffmpeg,['-hide_banner','-loglevel','error','-y',...args],{windowsHide:true,cwd:build});let stderr='';child.stderr.on('data',d=>stderr+=d);child.on('error',reject);child.on('exit',c=>c===0?resolve():reject(new Error(`FFmpeg ${c}: ${stderr}`)));}); }
async function main(){
 await fs.mkdir(build,{recursive:true});await fs.mkdir(output,{recursive:true});
 for(const [key,file] of Object.entries({logo:'theeskapooo-logo.svg',icon:'theeskapooo-icon.svg',team:'tech-titans.svg',college:'kitsw-logo.jpg'})){assets[key]='data:image/png;base64,'+(await sharp(path.join(root,file)).resize({width:key==='logo'?1380:400}).png().toBuffer()).toString('base64');}
 assets.qr=await QRCode.toDataURL('THEESKAPOOO PRODUCT DEMO - NOT A PAYMENT CODE',{margin:1,width:440,color:{dark:C.green,light:'#ffffff'}});
 const shots=JSON.parse(await fs.readFile(path.join(__dirname,'storyboard.json'),'utf8'));let timeline=0,cues=[];
 for(let i=0;i<shots.length;i++){
  const shot=shots[i];shot.start=timeline;shot.clips=[];let local=.45;
  await png(background(shot.id,i),path.join(build,`${shot.id}-bg.png`));
  for(let j=0;j<shot.lines.length;j++){
   // Tighten the narration pace without changing voice pitch.
   await exec(['-i',`${shot.id}-${j}.wav`,'-af','atempo=1.08','-c:a','pcm_s16le',`${shot.id}-${j}-paced.wav`]);
   const wav=readWav(await fs.readFile(path.join(build,`${shot.id}-${j}-paced.wav`)));
   shot.clips.push({wav,start:local});cues.push({start:timeline+local,end:timeline+local+wav.duration,text:shot.lines[j].replaceAll('Theeska Poo','THEESKAPOOO')});
   await png(ui(shot.id,j),path.join(build,`${shot.id}-${j}.png`));local+=wav.duration+.18;
  }
  shot.duration=Math.ceil((local+.42)*FPS)/FPS;timeline+=shot.duration;
  const files=[];for(let j=0;j<shot.clips.length;j++){const begin=j===0?0:shot.clips[j].start;const end=j+1<shot.clips.length?shot.clips[j+1].start:shot.duration;files.push(`file '${shot.id}-${j}.png'\nduration ${(end-begin).toFixed(6)}`);}
  files.push(`file '${shot.id}-${shot.clips.length-1}.png'`);await fs.writeFile(path.join(build,`${shot.id}-images.txt`),files.join('\n'));
  // Readable full-frame preview, including the first spoken caption.
  let caption=lines(640,650,wrap(cues[cues.length-shot.clips.length].text,86),20,C.cream,500,28).replaceAll('font-size="20"','text-anchor="middle" font-size="20"');
  await png(background(shot.id,i)+ui(shot.id,shot.clips.length-1)+caption,path.join(build,`${shot.id}-preview.png`));
 }
 await fs.writeFile(path.join(output,'THEESKAPOOO-English.srt'),cues.map((c,i)=>`${i+1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${wrap(c.text,80).join('\n')}\n`).join('\n'));
 const ass='[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nWrapStyle: 2\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Segoe UI,31,&H00EDFBFF,&H00EDFBFF,&H00203310,&HAA203310,-1,0,0,0,100,100,0,0,1,2,0,2,110,110,72,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n'+cues.map(c=>`Dialogue: 0,${stamp(c.start,true)},${stamp(c.end,true)},Default,,0,0,0,,{\\fad(100,100)}${wrap(c.text,86).join('\\N')}`).join('\n');
 await fs.writeFile(path.join(build,'captions.ass'),ass);
 await fs.writeFile(path.join(output,'timeline.json'),JSON.stringify({duration:timeline,resolution:'1920x1080',fps:FPS,scenes:shots.map(s=>({id:s.id,title:s.title,start:s.start,duration:s.duration})),disclosure:'Illustrative animated workflow. Fictional order data. Non-payment demo QR. Windows Zira synthetic narration. Original procedural soundtrack.'},null,2));
 // Mix local synthetic narration with an original, quiet ambient arpeggio.
 const rate=44100,n=Math.ceil(timeline*rate),audio=new Float32Array(n*2),voice=new Float32Array(n);
 for(const shot of shots)for(const clip of shot.clips){const at=Math.round((shot.start+clip.start)*rate),len=Math.floor(clip.wav.duration*rate);for(let i=0;i<len;i++){const p=i*clip.wav.rate/rate,l=Math.floor(p),f=p-l;voice[at+i]+=(clip.wav.samples[l]||0)*(1-f)+(clip.wav.samples[l+1]||0)*f;}}
 const chords=[[130.813,164.814,195.998],[110,130.813,164.814],[87.307,110,130.813],[97.999,123.471,146.832]];
 for(let i=0;i<n;i++){
  const t=i/rate,chord=chords[Math.floor(t/4)%4],beat=t%.5,note=chord[Math.floor(t/.5)%3]*2,fade=Math.min(1,t/2,(timeline-t)/2),duck=Math.abs(voice[i])>.01?.63:1;
  let pad=0;for(const f of chord)pad+=Math.sin(2*Math.PI*f*t)*.0035;
  const pluck=(Math.sin(2*Math.PI*note*t)+.2*Math.sin(2*Math.PI*note*2*t))*Math.exp(-beat*8)*Math.min(1,beat/.012)*.013;
  const music=(pad+pluck)*Math.max(0,fade)*duck,v=voice[i]*1.3;
  audio[i*2]=Math.tanh(v+music);audio[i*2+1]=Math.tanh(v+music*.92);
 }
 await fs.writeFile(path.join(build,'soundtrack.wav'),writeWav(audio,rate));
 console.log(`Prepared ${shots.length} scenes, ${timeline.toFixed(1)} seconds, 1080p.`);
 await sharp({create:{width:1920,height:1080,channels:3,background:C.dark}}).composite(await Promise.all(shots.map(async(s,i)=>({input:await sharp(path.join(build,`${s.id}-preview.png`)).resize(640,360).toBuffer(),left:(i%3)*640,top:Math.floor(i/3)*360})))).png().toFile(path.join(output,'THEESKAPOOO-storyboard.png'));
 await png(background('intro',0)+ui('intro',1),path.join(output,'THEESKAPOOO-cover.png'));
 if(process.argv.includes('--prepare-only'))return;
 for(const shot of shots){
  const target=path.join(build,`${shot.id}.mp4`);
  if(process.argv.includes('--resume')){try{await fs.access(target);console.log(`Reusing ${shot.id}`);continue;}catch{}}
  console.log(`Rendering ${shot.id} (${shot.duration.toFixed(1)}s)…`);
  await exec(['-loop','1','-framerate',String(FPS),'-i',`${shot.id}-bg.png`,'-f','concat','-safe','0','-i',`${shot.id}-images.txt`,'-filter_complex_threads','1','-filter_complex',`[1:v]fps=${FPS},format=rgba,fade=t=in:st=0:d=0.45:alpha=1[card];[0:v][card]overlay=x=0:y='if(lt(t,0.7),48*pow(1-t/0.7,3),0)':shortest=1,format=yuv420p[v]`,'-map','[v]','-t',shot.duration.toFixed(6),'-r',String(FPS),'-an','-c:v','libx264','-preset','fast','-crf','19','-threads','4',target]);
 }
 await fs.writeFile(path.join(build,'clips.txt'),shots.map(s=>`file '${s.id}.mp4'`).join('\n'));
 console.log('Mastering captions, narration and music…');
 await exec(['-f','concat','-safe','0','-i','clips.txt','-i','soundtrack.wav','-vf',`ass=captions.ass,fade=t=in:st=0:d=0.4,fade=t=out:st=${(timeline-.7).toFixed(3)}:d=0.7`,'-af','loudnorm=I=-16:TP=-1.5:LRA=9','-c:v','libx264','-preset','medium','-crf','19','-threads','4','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-ar','48000','-t',timeline.toFixed(6),'-movflags','+faststart','-metadata','title=THEESKAPOOO | Print. Pick up. Pooo!','-metadata','comment=Illustrative workflow with demo data. Synthetic English narration. Original soundtrack.',path.join(output,'THEESKAPOOO-Product-Film-English.mp4')]);
 console.log(`Finished: ${path.join(output,'THEESKAPOOO-Product-Film-English.mp4')}`);
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
