(function (root) {
  const supported = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'tif', 'tiff'];
  const manual = ['doc','docx','ppt','pptx','xls','xlsx','odt','ods','odp','rtf','txt','csv','heic','heif','bmp','gif'];
  function invalid() { throw Error('This file is damaged or its contents do not match its extension. Export a fresh PDF and try again.'); }
  async function count(bytes, name, pdfLib) {
    const ext = name.split('.').pop().toLowerCase();
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const text = (start, size) => String.fromCharCode(...b.subarray(start, start + size));
    if (manual.includes(ext)) {
      if (!b.length) invalid();
      if (['docx','pptx','xlsx','odt','ods','odp'].includes(ext) && text(0,4) !== 'PK\x03\x04') invalid();
      if (['doc','ppt','xls'].includes(ext) && ![208,207,17,224,161,177,26,225].every((n,i)=>b[i]===n)) invalid();
      if (ext === 'rtf' && !text(0,20).trimStart().startsWith('{\\rtf')) invalid();
      if (['heic','heif'].includes(ext) && text(4,4) !== 'ftyp') invalid();
      if (ext === 'bmp' && text(0,2) !== 'BM') invalid();
      if (ext === 'gif' && !['GIF87a','GIF89a'].includes(text(0,6))) invalid();
      if (['txt','csv'].includes(ext) && b.subarray(0,1024).includes(0) && !((b[0]===255&&b[1]===254)||(b[0]===254&&b[1]===255))) invalid();
      // Office/text pagination depends on the printing application's layout.
      // Never present metadata or slide/sheet counts as verified print pages.
      return null;
    }
    if (!supported.includes(ext)) throw Error('Unsupported document format.');
    let pages = 1;
    if (ext === 'pdf') {
      if (!text(0, Math.min(1024, b.length)).includes('%PDF-')) invalid();
      try {
        const doc = await pdfLib.PDFDocument.load(b, { ignoreEncryption: false, throwOnInvalidObject: true, updateMetadata: false });
        pages = doc.getPages().length;
      } catch { throw Error('Cannot count this PDF. It may be password-protected or damaged. Export an unlocked PDF and try again.'); }
    } else if (ext === 'png') {
      if (b.length < 33 || b[0] !== 137 || text(1, 7) !== 'PNG\r\n\x1a\n') invalid();
      const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
      for (let p = 8; p + 12 <= b.length;) {
        const size = view.getUint32(p); if (size > b.length - p - 12) invalid();
        if (text(p + 4, 4) === 'acTL') throw Error('Animated images need exporting to a PDF with the pages you want to print.');
        p += size + 12;
      }
    } else if (ext === 'jpg' || ext === 'jpeg') {
      if (b.length < 4 || b[0] !== 255 || b[1] !== 216 || b[2] !== 255) invalid();
    } else if (ext === 'webp') {
      if (b.length < 21 || text(0, 4) !== 'RIFF' || text(8, 4) !== 'WEBP') invalid();
      if (text(12, 4) === 'VP8X' && (b[20] & 2)) throw Error('Animated images need exporting to PDF first.');
    } else {
      if (b.length < 8) invalid();
      const little = text(0, 2) === 'II'; if (!little && text(0, 2) !== 'MM') invalid();
      const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
      if (view.getUint16(2, little) !== 42) throw Error('This TIFF variant needs exporting to PDF first.');
      let offset = view.getUint32(4, little); pages = 0; const seen = new Set();
      while (offset) {
        if (seen.has(offset) || offset + 2 > b.length || pages >= 10000) invalid();
        seen.add(offset);
        const end = offset + 2 + view.getUint16(offset, little) * 12;
        if (end + 4 > b.length) invalid();
        offset = view.getUint32(end, little); pages++;
      }
    }
    if (!Number.isInteger(pages) || pages < 1 || pages > 10000) throw Error('Documents must contain 1 to 10,000 pages.');
    return pages;
  }
  const api = { count, supported, manual };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DocumentPagesCore = api;
})(typeof self === 'undefined' ? globalThis : self);
