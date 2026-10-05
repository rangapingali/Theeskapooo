const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PDFDocument } = require('pdf-lib');
const sharp = require('sharp');
const { inspectDocument } = require('../server/document-inspection.cjs');
const core = require('../document-pages-core.js');
test('PDF page counts are detected from real page trees, including compressed PDFs', async () => {
  const pdf = await PDFDocument.create(); for (let i = 0; i < 7; i++) pdf.addPage();
  const bytes = await pdf.save();
  assert.equal(await core.count(bytes, 'notes.pdf', { PDFDocument }), 7);
  assert.equal(await inspectDocument(bytes, 'notes.pdf'), 7);
  pdf.context.trailerInfo.Encrypt = pdf.context.obj({});
  await assert.rejects(inspectDocument(await pdf.save(), 'locked.pdf'), /password-protected/);
});
test('common images count as one; disguised, damaged and unpaginated files are rejected', async () => {
  for (const format of ['png', 'jpeg', 'webp']) {
    const bytes = await sharp({ create: { width: 12, height: 8, channels: 3, background: 'white' } }).toFormat(format).toBuffer();
    assert.equal(await inspectDocument(bytes, 'photo.' + format), 1);
  }
  await assert.rejects(inspectDocument(Buffer.from('not a pdf'), 'fake.pdf'), /damaged/);
  await assert.rejects(inspectDocument(Buffer.from('document'), 'essay.docx'), /damaged/);
  await assert.rejects(inspectDocument(Buffer.from([255,216,255,0,0]), 'broken.jpg'), /unreadable/);
});

test('major unpaginated formats request manual print pages instead of inventing one page', async()=>{
  assert.equal(await inspectDocument(Buffer.from('A report with variable line wrapping'), 'notes.txt'),null);
  assert.equal(await inspectDocument(Buffer.from('{\\rtf1 A sample report}'), 'notes.rtf'),null);
  assert.equal(await core.count(Buffer.from('PK\x03\x04document-container'), 'essay.docx'),null);
  for(const ext of ['doc','xls','ppt']) assert.equal(await core.count(Buffer.from([208,207,17,224,161,177,26,225]),'file.'+ext),null);
  await assert.rejects(core.count(Buffer.from('MZ executable'), 'report.xlsx'),/damaged/);
});
test('multipage TIFF counts every directory and rejects cyclic page links', async () => {
  const bytes = Buffer.alloc(238); bytes.write('II'); bytes.writeUInt16LE(42, 2); bytes.writeUInt32LE(8, 4);
  function page(offset, next, pixel) {
    const tags = [[256,4,1],[257,4,1],[258,3,8],[259,3,1],[262,3,1],[273,4,pixel],[277,3,1],[278,4,1],[279,4,1]];
    bytes.writeUInt16LE(tags.length, offset);
    tags.forEach(([tag, type, value], i) => { const p=offset+2+i*12; bytes.writeUInt16LE(tag,p); bytes.writeUInt16LE(type,p+2); bytes.writeUInt32LE(1,p+4); bytes.writeUInt32LE(value,p+8); });
    bytes.writeUInt32LE(next, offset+110); bytes[pixel]=255;
  }
  page(8,122,236); page(122,0,237);
  assert.equal(await inspectDocument(bytes, 'scan.tiff'), 2);
  bytes.writeUInt32LE(8,232);
  await assert.rejects(core.count(bytes, 'scan.tif'), /damaged/);
});
