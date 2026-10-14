const { PDFDocument, degrees } = require('pdf-lib');
const core = require('../print-core.js');
const fail = message => Object.assign(Error(message + ' Download the original to print it manually.'), { httpStatus: 422 });

function selected(range, total) {
  core.pageCount(range, total);
  const indices = new Set();
  for (const part of (range.trim() || `1-${total}`).split(',')) {
    const [a, b = a] = part.trim().split('-').map(Number);
    for (let i = a; i <= b; i++) indices.add(i - 1);
  }
  return [...indices].sort((a, b) => a - b);
}

// Each entry is one output side. Null is an intentional blank back of a sheet.
function sidePlan(count, copies, duplex, collate) {
  const plan = [];
  if (collate) {
    for (let copy = 0; copy < copies; copy++) {
      for (let i = 0; i < count; i++) plan.push(i);
      if (duplex && count % 2 && copy < copies - 1) plan.push(null);
    }
  } else {
    const step = duplex ? 2 : 1;
    for (let i = 0; i < count; i += step) {
      for (let copy = 0; copy < copies; copy++) {
        plan.push(i);
        if (duplex) plan.push(i + 1 < count ? i + 1 : null);
      }
    }
    if (plan.at(-1) === null) plan.pop();
  }
  return plan;
}

async function prepare(bytes, name, settings) {
  const s = { ...core.defaults, ...settings };
  const image = /\.png$/i.test(name);
  const estimate = core.estimate(s, { image });
  if (s.size !== 'A4' || s.binding !== 'none' || !/\.(pdf|png)$/i.test(name)) throw fail('This document needs manual printing.');
  if (bytes.length > 25 * 1024 * 1024 || s.pages > 1000 || estimate.printedSides > 2000) throw fail('This job exceeds the prepared-PDF limit (1,000 source pages / 2,000 printed sides).');
  const out = await PDFDocument.create();
  const sources = [];
  if (image) {
    if (s.pages !== 1) throw fail('The image page count is incorrect.');
    selected(s.range, 1);
    const png = await require('sharp')(bytes, { limitInputPixels: 25000000, failOn: 'warning' }).rotate().png().toBuffer();
    const asset = await out.embedPng(png);
    for (let i = 0; i < s.copies; i++) sources.push({ asset, rotation: 0 });
  } else {
    let input;
    try { input = await PDFDocument.load(bytes); } catch { throw fail('This PDF cannot be prepared safely.'); }
    if (input.getPageCount() !== s.pages) throw fail('The document page count changed.');
    // Embedding loses annotations, so do not silently omit form fields, comments or stamps.
    if (input.getPages().some(page => (page.node.Annots()?.size() || 0) > 0)) throw fail('This PDF has annotations or form fields; flatten it first.');
    for (const index of selected(s.range, s.pages)) {
      const page = input.getPage(index);
      sources.push({ asset: page.node.Contents() ? await out.embedPage(page) : null, rotation: -page.getRotation().angle });
    }
  }
  const count = Math.ceil(sources.length / s.layout);
  const plan = sidePlan(count, image ? 1 : s.copies, s.sides === 'double', s.collate === 'on');
  const dims = s.orientation === 'landscape' ? [841.89, 595.28] : [595.28, 841.89];
  const cols = s.layout === 4 || (s.layout === 2 && s.orientation === 'landscape') ? 2 : 1;
  const rows = s.layout / cols;
  for (const side of plan) {
    const page = out.addPage(dims);
    if (side === null) continue;
    const cw = dims[0] / cols, ch = dims[1] / rows;
    sources.slice(side * s.layout, (side + 1) * s.layout).forEach(({ asset, rotation }, cell) => {
      if (!asset) return;
      const r = rotation * Math.PI / 180, c = Math.cos(r), n = Math.sin(r);
      const corners = [[0,0],[asset.width,0],[0,asset.height],[asset.width,asset.height]].map(([x,y]) => [x*c-y*n,x*n+y*c]);
      const minX = Math.min(...corners.map(p => p[0])), minY = Math.min(...corners.map(p => p[1]));
      const width = Math.max(...corners.map(p => p[0])) - minX, height = Math.max(...corners.map(p => p[1])) - minY;
      if (!Number.isFinite(width + height) || width <= 0 || height <= 0) throw fail('Invalid page dimensions.');
      // 6.35 mm margins: preserve the entire image and allow for non-borderless printers.
      const scale = Math.min((cw - 36) / width, (ch - 36) / height);
      const options = { x: cell % cols * cw + (cw-width*scale)/2-minX*scale, y: dims[1]-(Math.floor(cell/cols)+1)*ch+(ch-height*scale)/2-minY*scale, width: asset.width*scale, height: asset.height*scale, rotate: degrees(rotation) };
      if (image) page.drawImage(asset, options); else page.drawPage(asset, options);
    });
  }
  // Content/layout is embedded. Device-level duplex/colour must still be selected in the print app.
  return Buffer.from(await out.save());
}
module.exports = { prepare, selected, sidePlan };
