const {PDFDocument}=require('pdf-lib');
const sharp=require('sharp');
async function imagePdf(bytes,orientation='portrait') {
 const png=await sharp(bytes,{limitInputPixels:25000000,failOn:'warning'}).rotate().png().toBuffer();
 const pdf=await PDFDocument.create(),image=await pdf.embedPng(png);
 const [width,height]=orientation==='landscape'?[841.89,595.28]:[595.28,841.89];
 const margin=18,scale=Math.min((width-margin*2)/image.width,(height-margin*2)/image.height);
 const page=pdf.addPage([width,height]);
 page.drawImage(image,{x:(width-image.width*scale)/2,y:(height-image.height*scale)/2,width:image.width*scale,height:image.height*scale});
 // No HTML header/footer and no filename painted onto the physical page.
 return Buffer.from(await pdf.save());
}
module.exports={imagePdf};
