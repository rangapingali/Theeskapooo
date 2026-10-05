(function (root) {
  const formats = ['pdf','doc','docx','ppt','pptx','xls','xlsx','odt','ods','odp','rtf','txt','csv','jpg','jpeg','png','webp','heic','heif','bmp','gif','tif','tiff'];
  const priorityFee = 8;
  const rates = { A4: { bw: 5, colour: 10 }, A3: { bw: 5, colour: 10 }, Letter: { bw: 5, colour: 10 }, Legal: { bw: 5, colour: 10 } };
  const defaults = { copies: 1, colour: 'bw', sides: 'single', size: 'A4', range: '', pages: 1, orientation: 'portrait', layout: 1, binding: 'none' };
  function pageCount(range, total) {
    if (!Number.isInteger(total) || total < 1 || total > 10000) throw Error('Enter a page count from 1 to 10,000.');
    if (!String(range).trim()) return total;
    const selected = new Set();
    for (const part of String(range).split(',')) {
      const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
      if (!match) throw Error('Use page ranges such as 1-5, 8, 11-13.');
      const start = Number(match[1]), end = Number(match[2] || match[1]);
      if (start < 1 || end < start || end > total) throw Error(`Page range must be within 1-${total}.`);
      for (let i = start; i <= end; i++) selected.add(i);
    }
    return selected.size;
  }
  function estimate(settings) {
    const s = settings;
    if (!Number.isInteger(s.copies) || s.copies < 1 || s.copies > 500) throw Error('Copies must be between 1 and 500.');
    if (!rates[s.size] || !['bw','colour'].includes(s.colour) || !['single','double'].includes(s.sides) || ![1,2,4].includes(s.layout) || !['portrait','landscape'].includes(s.orientation) || !['none','staple','spiral'].includes(s.binding)) throw Error('Choose valid print settings.');
    const pages = pageCount(s.range, s.pages);
    const sidesPerCopy = Math.ceil(pages / s.layout);
    const printedSides = sidesPerCopy * s.copies;
    const sheets = Math.ceil(sidesPerCopy / (s.sides === 'double' ? 2 : 1)) * s.copies;
    const rate = rates[s.size][s.colour];
    return { pages, printedSides, sheets, amount: rate === null ? 0 : printedSides * rate, needsQuote: rate === null || s.binding !== 'none', minutes: Math.ceil(printedSides / (s.colour === 'colour' ? 5 : 15)) + (s.binding === 'spiral' ? 5 * s.copies : 0) };
  }
  function fileError(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!formats.includes(ext)) return 'Unsupported format. Export this file to PDF first.';
    if (!file.size) return 'This file is empty.';
    if (file.size > 25 * 1024 * 1024) return 'Each file must be 25 MB or smaller.';
    return '';
  }
  const api = { formats, rates, defaults, pageCount, estimate, fileError, priorityFee };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PrintCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
