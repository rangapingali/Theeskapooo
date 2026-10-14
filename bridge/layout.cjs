const core=require('../print-core.js');
const {prepare,selected}=require('../server/shop-print-pdf.cjs');
async function layout(bytes,name,s){
 if(s.colour!=='bw'||s.size!=='A4'||!Number.isInteger(s.copies)||s.copies<1||s.copies>20)throw Error('Unsupported Brother test settings.');
 if(core.estimate(s,{image:core.isImageFile(name)}).printedSides>200)throw Error('Home test limit is 200 printed sides.');
 return prepare(Buffer.from(bytes),name,s);
}
module.exports={layout,selected};
