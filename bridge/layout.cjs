const {PDFDocument,degrees,PDFName}=require('pdf-lib');
function selected(range,total){
 const result=new Set();
 for(const part of (range||`1-${total}`).split(',')){
  const m=part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);if(!m)throw Error('Invalid page range.');
  const a=Number(m[1]),b=Number(m[2]||m[1]);if(a<1||b<a||b>total)throw Error('Page range exceeds document.');
  for(let i=a;i<=b;i++)result.add(i-1);
 }return [...result].sort((a,b)=>a-b);
}
async function layout(bytes,name,s){
 if(s.collate==='off')throw Error('Grouped copies are unavailable in the Brother test; use complete sets.');
 if(s.colour!=='bw'||s.size!=='A4'||!['single','double'].includes(s.sides)||!['portrait','landscape'].includes(s.orientation)||![1,2,4].includes(s.layout)||!Number.isInteger(s.copies)||s.copies<1||s.copies>20)throw Error('Unsupported Brother test settings.');
 const out=await PDFDocument.create();let sources=[],image=false;
 if(/\.pdf$/i.test(name)){
  const input=await PDFDocument.load(bytes);
  if(input.getPageCount()!==s.pages)throw Error('Document page count changed.');
  if(input.getPages().some(p=>(p.node.Annots()?.size()||0)>0))throw Error('Flatten PDF forms/comments before bridge printing to preserve their appearance.');
  for(const i of selected(s.range,input.getPageCount())){const page=input.getPage(i);sources.push({asset:await out.embedPage(page),rotation:-page.getRotation().angle});}
 }else if(/\.png$/i.test(name)){if(s.pages!==1)throw Error('PNG must have one page.');selected(s.range,1);image=true;const asset=await out.embedPng(bytes);sources=Array.from({length:s.copies},()=>({asset,rotation:0}));}
 else throw Error('Only PDF and PNG supported.');
 const copies=image?1:s.copies;
 const perCopy=Math.ceil(sources.length/s.layout);
 if(perCopy*copies>200)throw Error('Home test limit is 200 printed sides.');
 const dims=s.orientation==='landscape'?[841.89,595.28]:[595.28,841.89];
 const cols=s.layout===4?2:s.layout===2&&s.orientation==='landscape'?2:1,rows=s.layout/cols;
 for(let copy=0;copy<copies;copy++){
  for(let start=0;start<sources.length;start+=s.layout){
   const page=out.addPage(dims),cw=dims[0]/cols,ch=dims[1]/rows;
   sources.slice(start,start+s.layout).forEach(({asset,rotation},cell)=>{
    const radians=rotation*Math.PI/180,c=Math.cos(radians),n=Math.sin(radians);
    const points=[[0,0],[asset.width,0],[0,asset.height],[asset.width,asset.height]].map(([x,y])=>[x*c-y*n,x*n+y*c]);
    const minX=Math.min(...points.map(p=>p[0])),minY=Math.min(...points.map(p=>p[1]));
    const w=Math.max(...points.map(p=>p[0]))-minX,h=Math.max(...points.map(p=>p[1]))-minY,scale=Math.min((cw-24)/w,(ch-24)/h);
    const options={x:(cell%cols)*cw+(cw-w*scale)/2-minX*scale,y:dims[1]-(Math.floor(cell/cols)+1)*ch+(ch-h*scale)/2-minY*scale,width:asset.width*scale,height:asset.height*scale,rotate:degrees(rotation)};
    if(image)page.drawImage(asset,options);else page.drawPage(asset,options);
   });
  }
  // Keep each PDF copy on separate sheets for odd duplex page counts.
  if(s.sides==='double'&&perCopy%2&&copy<copies-1)out.addPage(dims);
 }
 return out.save();
}
module.exports={layout,selected};
