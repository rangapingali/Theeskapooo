// Original motion-design film + original procedural score. No external assets/services.
const fs = require('node:fs/promises');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {once} = require('node:events');
const sharp = require('sharp');
const ffmpeg = require('ffmpeg-static');
const output=path.join(__dirname,'output'), build=path.join(__dirname,'build');
const W=1920,H=1080,FPS=24,DURATION=64;
const cuts=[0,4,8,16,24,32,40,48,56,64];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const clamp=x=>Math.max(0,Math.min(1,x)), ease=x=>1-(1-clamp(x))**3;
const text=(x,y,s,size=32,col='#eef8ef',weight=500,extra='')=>`<text x="${x}" y="${y}" font-family="Segoe UI,Arial,sans-serif" font-size="${size}" font-weight="${weight}" fill="${col}" ${extra}>${esc(s)}</text>`;
const box=(x,y,w,h,col='#102d29',r=18,stroke='#36574a')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${col}" stroke="${stroke}"/>`;
function paper(x,y,k=1,angle=0,alpha=1){return `<g opacity="${alpha}" transform="translate(${x} ${y}) rotate(${angle}) scale(${k})">${box(0,0,150,200,'#eaf2dd',10,'#efffc8')}${box(22,27,66,10,'#b29150',3,'none')}${[62,84,106,128,150].map((a,i)=>box(22,a,i===4?60:103,5,'#8ca197',2,'none')).join('')}</g>`;}
function shield(x,y,k=1){return `<g transform="translate(${x} ${y}) scale(${k})"><path d="M0 -62L55 -30V32L0 64 -55 32V-30Z" fill="#112825" stroke="url(#gold)" stroke-width="3"/><path d="M-33 -28H33V-13H9V30L-8 22V-13H-33Z" fill="url(#gold)"/><path d="M-18 0H24V12H11V36L-4 45V12H-18Z" fill="#e3edb6"/></g>`;}
function phone(content,t,large=false){
 const x=large?1150:1220, y=200+Math.sin(t*.65)*10, rot=Math.sin(t*.25)*1.5;
 return `<g transform="translate(${x} ${y}) rotate(${rot} 210 310)"><ellipse cx="200" cy="670" rx="230" ry="23" fill="#000" opacity=".6"/>${box(-9,0,418,635,'#37584c',54,'#657767')}${box(0,0,400,626,'#040b0d',50,'#8a967b')}${box(16,17,368,592,'#f3f5e9',37,'#121e1a')}${box(150,24,105,22,'#07110f',12,'none')}${text(36,82,'THEESKAPOOO',22,'#244e3c',800)}<g transform="translate(34 110)">${content}</g>${box(148,585,110,5,'#2e463a',3,'none')}</g>`;
}
function caption(kicker,lines,sub,t){const a=ease(t/1.1), offset=(1-a)*60;return `<g opacity="${a}" transform="translate(0 ${offset})">${text(150,310,kicker,22,'#c7aa6a',600,'letter-spacing="5"')}${lines.map((l,i)=>text(144,445+i*104,l,88,'#eff6e9',650)).join('')}${text(150,690,sub,28,'#adc8bc',400)}</g>`;}
function scene(t){
 let n=cuts.findIndex((v,i)=>t>=v&&t<cuts[i+1]);if(n<0)n=8;
 const u=t-cuts[n],dur=cuts[n+1]-cuts[n],intro=ease(u/.8);
 let s='';
 if(n===0){
  for(let i=0;i<12;i++){const z=.35+(i%4)*.18;s+=paper(1120+Math.sin(i*5.2+t*.13)*410,140+(i*101+t*24)%680,z,(i*31+t*8)%60-30,.12+i*.045);}
  s+=caption('CAMPUS LIFE MOVES FAST.',['Your time','deserves better.'],'Less waiting at the print counter.',u);
 }else if(n===1){
  const scale=.72+ease(u/2)*.28;s+=`<g opacity="${intro}" transform="translate(960 420) scale(${scale})">${shield(0,-90,1.2)}${text(0,90,'TECH TITANS',104,'url(#gold)',800,'text-anchor="middle" letter-spacing="9"')}${text(0,172,'BUILT ON CAMPUS. FOR CAMPUS.',23,'#d5dfc8',500,'text-anchor="middle" letter-spacing="6"')}</g>`;
 }else if(n===2){
  const scale=.85+ease(u/3)*.15;s+=`<g transform="translate(960 480) scale(${scale})" opacity="${intro}">${text(0,-105,'INTRODUCING',24,'#c2d3be',500,'text-anchor="middle" letter-spacing="10"')}${text(0,30,'THEESKAPOOO',132,'#f1f8e9',800,'text-anchor="middle" letter-spacing="1"')}${text(0,128,'Print. Pick up. Pooo!',40,'#d6b674',400,'text-anchor="middle"')}</g>`;
  for(let i=0;i<4;i++)s+=paper(120+i*480,760+Math.sin(u+i)*24,.35,(i-1.5)*12,.35);
 }else if(n===3){
  s+=caption('01 / DOCUMENTS',['Send it.','From anywhere.'],'Add your files. Or choose a trending print.',u);
  let c=text(0,26,'Your documents',27,'#214f3c',700)+box(0,50,330,120,'#e7eddc',14,'#9eb590')+text(165,100,'↑',40,'#214f3c',600,'text-anchor="middle"')+text(165,143,'Add documents',20,'#214f3c',600,'text-anchor="middle"');
  ['Assignment.pdf','Lab record.docx','Diagram.png'].forEach((name,i)=>{const p=ease((u-1-i*.6)/.7);c+=`<g opacity="${p}" transform="translate(${(1-p)*80} 0)">${box(0,192+i*66,330,54,'#fff',12,'#ccd6c4')}${text(14,226+i*66,name,19,'#264633',600)}${text(301,226+i*66,'✓',23,'#367755',700,'text-anchor="end"')}</g>`;});
  s+=phone(c,t);
 }else if(n===4){
  s+=caption('02 / PRINT SETTINGS',['Your print.','Your way.'],'Copies. Colour. Sides. A clear total.',u);
  let c=text(0,26,'Make it your way',27,'#214f3c',700);
  [['Copies','2'],['Colour','Black & white'],['Print sides','Double-sided'],['Paper size','A4']].forEach((a,i)=>{c+=text(0,78+i*73,a[0],16,'#536c5b')+box(0,91+i*73,330,43,'#fff',10,'#bccdb3')+text(13,119+i*73,a[1],19,'#244932',600);});
  c+=box(0,393,330,56,'#214f3c',12,'none')+text(165,430,'Review & pay →',20,'#fff',650,'text-anchor="middle"');s+=phone(c,t);
 }else if(n===5){
  s+=caption('03 / YOUR PAYMENT CHOICE',['Online.','Or at the shop.'],'Choose what fits your day.',u);
  let c=text(0,26,'Choose how to pay',27,'#214f3c',700)+box(0,58,330,102,'#e0ebd3',14,'#69845a')+text(22,99,'UPI payment',24,'#214f3c',700)+text(22,136,'Pay with your UPI app',17,'#536c5b')+box(0,185,330,120,'#fff',14,'#bdcbb4')+text(22,228,'Pay at the shop',24,'#214f3c',700)+text(22,268,'Choose your payment visit',17,'#536c5b')+text(165,390,'Simple choices. One order.',18,'#52694f',500,'text-anchor="middle"');s+=phone(c,t);
 }else if(n===6){
  s+=caption('BEHIND THE COUNTER',['A clear queue.','A smoother day.'],'Print settings and collection codes, together.',u);
  const x=1140,y=250; s+=`<g transform="translate(${x} ${y}) rotate(-3)">${box(0,0,580,530,'#0c211e',28,'#809981')}${text(28,56,'THE PRINT COUNTER',24,'#d8e5ce',700)}`;
  [['PRIORITY','Slot 2 / No. 017','#d8b575'],['NEW ORDER','Slot 2 / No. 018','#97c6b2'],['READY','Slot 1 / No. 024','#97c6b2']].forEach((a,i)=>{const p=ease((u-i*.4)/.8);s+=`<g opacity="${p}" transform="translate(0 ${(1-p)*35})">${box(22,89+i*126,536,106,i===0?'#362e20':'#173a31',16,a[2])}${text(43,124+i*126,a[0],16,a[2],700,'letter-spacing="2"')}${text(43,166+i*126,a[1],29,'#f0f5e9',600)}</g>`;});s+='</g>';
 }else if(n===7){
  s+=caption('LESS WAITING. MORE LIVING.',['Ready.','Collect. Go.'],'Show your code. Get back to your day.',u);
  let c=`<circle cx="165" cy="111" r="68" fill="#e0ebd2"/><path d="M130 111l24 25 48-53" fill="none" stroke="#315e44" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`+text(165,226,'Ready to collect',31,'#214f3c',700,'text-anchor="middle"')+box(0,262,330,105,'#e3ecd7',15,'#9aaa87')+text(165,305,'Slot 2 / No. 017',26,'#214f3c',700,'text-anchor="middle"')+text(165,340,'Show this code at the counter',16,'#536c5b',400,'text-anchor="middle"');s+=phone(c,t);
 }else{
  s+=`<g opacity="${intro}">${shield(960,300,1.15)}${text(960,482,'TECH TITANS',120,'url(#gold)',800,'text-anchor="middle" letter-spacing="8"')}${text(960,566,'IDEAS INTO IMPACT',25,'#c5d5bd',600,'text-anchor="middle" letter-spacing="9"')}${text(960,707,'THEESKAPOOO',51,'#edf5e7',700,'text-anchor="middle"')}${text(960,771,'theeskapooo.onrender.com',25,'#9ebdaa',400,'text-anchor="middle"')}</g>`;
 }
 const fade=n===8?clamp((DURATION-t)/1.2):1;
 return {content:s,fade,n};
}
function frame(t){
 const {content,fade,n}=scene(t);let particles='';
 for(let i=0;i<50;i++){const x=(i*277.7+t*(8+i%7))%W,y=(i*131.9-t*(3+i%5)+H*8)%H;particles+=`<circle cx="${x}" cy="${y}" r="${.7+i%3*.5}" fill="#d1e2be" opacity="${.1+(Math.sin(t+i)+1)*.12}"/>`;}
 const sweep=(t*110)%2700-400;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><radialGradient id="room" cx="76%" cy="40%" r="80%"><stop stop-color="#183f36"/><stop offset=".5" stop-color="#0b1c1b"/><stop offset="1" stop-color="#03090d"/></radialGradient><linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff0bf"/><stop offset=".45" stop-color="#d2b26b"/><stop offset="1" stop-color="#8d703e"/></linearGradient><linearGradient id="beam"><stop stop-color="#96e6c4" stop-opacity="0"/><stop offset=".5" stop-color="#96e6c4" stop-opacity=".12"/><stop offset="1" stop-color="#96e6c4" stop-opacity="0"/></linearGradient></defs><rect width="1920" height="1080" fill="#020609"/><g opacity="${fade}"><rect width="1920" height="1080" fill="url(#room)"/><path d="M${sweep} 0l360 0 680 1080h-360Z" fill="url(#beam)"/><g transform="translate(1420 510) rotate(${-t*1.8})"><ellipse rx="670" ry="340" stroke="#769b83" stroke-width="1" opacity=".13" fill="none"/><ellipse rx="700" ry="365" stroke="#c6b778" opacity=".07" fill="none"/></g>${particles}${content}<path d="M120 930H1800" stroke="#8baa82" opacity=".14"/>${text(150,970,'TECH TITANS  /  A CAMPUS ORIGINAL',16,'#8aa18e',500,'letter-spacing="3"')}${text(1760,970,n>=3&&n<=7?'PRODUCT VISUALISATION':'THEESKAPOOO',14,'#789383',500,'text-anchor="end" letter-spacing="2"')}</g><rect width="1920" height="60" fill="#020609"/><rect y="1020" width="1920" height="60" fill="#020609"/></svg>`;
}
async function score(file){
 const rate=48000,N=DURATION*rate,pcm=Buffer.alloc(N*4),chords=[[55,82.407,110,138.591],[73.416,110,146.832,184.997],[65.406,97.999,130.813,164.814],[82.407,123.471,164.814,207.652]];
 let seed=94211,low=0;
 for(let i=0;i<N;i++){
  const t=i/rate,beat=t%0.5,bar=Math.floor(t/8),ch=chords[bar%4],env=clamp(t/3)*clamp((DURATION-t)/3),drive=t<8?.3:t<16?.65:1;
  seed=(seed*1664525+1013904223)>>>0;const noise=seed/2147483648-1;low+=(noise-low)*.08;
  const kick=Math.sin(2*Math.PI*(46*beat+5*(1-Math.exp(-beat*30))))*Math.exp(-beat*19)*.22*drive;
  const pad=ch.reduce((s,f,j)=>s+Math.sin(2*Math.PI*f*t+Math.sin(t*.4+j)*.15)*.025,0)*(0.8+Math.sin(t*.7)*.2);
  const arpTime=t%.25,arp=ch[Math.floor(t*4)%4]*4;
  const pluck=Math.sin(2*Math.PI*arp*t)*Math.exp(-arpTime*16)*.025*drive;
  const hat=noise*Math.exp(-(t%.25)*170)*.015*drive;
  const rise=cuts.some(c=>c>0&&c-t>0&&c-t<.6)?low*.055:0;
  const impact=cuts.reduce((s,c)=>{const d=t-c;return s+(d>=0&&d<2?Math.sin(2*Math.PI*38*d)*Math.exp(-d*5)*.13:0);},0);
  const sample=Math.tanh((pad+kick+pluck+hat+rise+impact)*1.5)*env;
  pcm.writeInt16LE(Math.round(sample*29000),i*4);pcm.writeInt16LE(Math.round(sample*(.96+.035*Math.sin(t*.37))*29000),i*4+2);
 }
 const h=Buffer.alloc(44);h.write('RIFF');h.writeUInt32LE(pcm.length+36,4);h.write('WAVE',8);h.write('fmt ',12);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(2,22);h.writeUInt32LE(rate,24);h.writeUInt32LE(rate*4,28);h.writeUInt16LE(4,32);h.writeUInt16LE(16,34);h.write('data',36);h.writeUInt32LE(pcm.length,40);await fs.writeFile(file,Buffer.concat([h,pcm]));
}
async function main(){
 await fs.mkdir(output,{recursive:true});await fs.mkdir(build,{recursive:true});
 const samples=[2,6,12,20,28,36,44,52,60];
 for(const t of samples)await sharp(Buffer.from(frame(t))).resize(960,540).png().toFile(path.join(build,`frame-${t}.png`));
 const inputs=await Promise.all(samples.map(async(t,i)=>({input:await sharp(path.join(build,`frame-${t}.png`)).resize(640,360).toBuffer(),left:(i%3)*640,top:Math.floor(i/3)*360})));
 await sharp({create:{width:1920,height:1080,channels:3,background:'#03090d'}}).composite(inputs).png().toFile(path.join(output,'contact-sheet.png'));
 await sharp(Buffer.from(frame(60))).png().toFile(path.join(output,'THEESKAPOOO-cover.png'));
 if(process.argv.includes('--stills'))return;
 const wav=path.join(build,'original-score.wav');await score(wav);
 const video=path.join(output,'THEESKAPOOO-Tech-Titans-Reveal.mp4');
 const encoder=spawn(ffmpeg,['-hide_banner','-loglevel','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',`${W}x${H}`,'-r',String(FPS),'-i','pipe:0','-i',wav,'-c:v','libx264','-preset','fast','-crf','19','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-af','loudnorm=I=-16:TP=-1.5:LRA=11','-t',String(DURATION),'-movflags','+faststart','-metadata','title=THEESKAPOOO | A Tech Titans Original',video],{windowsHide:true,stdio:['pipe','ignore','inherit']});
 const done=once(encoder,'close');encoder.stdin.on('error',()=>{});
 for(let i=0;i<FPS*DURATION;i++){
  const pixels=await sharp(Buffer.from(frame(i/FPS))).removeAlpha().raw().toBuffer();
  if(!encoder.stdin.write(pixels))await once(encoder.stdin,'drain');
  if(i%(FPS*4)===0)console.log(`Rendered ${i/FPS}/${DURATION} seconds`);
 }
 encoder.stdin.end();const [code]=await done;if(code!==0)throw Error('Video export failed: '+code);
 // Marker sheet is useful when importing the MP4 into Resolve for further editing.
 await fs.writeFile(path.join(output,'scene-markers.csv'),'Start seconds,Scene\n0,The problem\n4,Tech Titans presents\n8,Product reveal\n16,Documents\n24,Print settings\n32,Payment choices\n40,Shop queue\n48,Ready to collect\n56,Tech Titans finale\n');
 console.log(video);
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
