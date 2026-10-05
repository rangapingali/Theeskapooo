const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
let active = 0;
function inspectDocument(bytes, name) {
  if (active >= 3) return Promise.reject(Object.assign(new Error('The document checker is busy. Please retry in a moment.'), { httpStatus: 429 }));
  active++;
  return new Promise((resolve, reject) => {
    let done = false;
    const worker = new Worker(__filename, { workerData: { bytes, name }, stdout: true, stderr: true, resourceLimits: { maxOldGenerationSizeMb: 192 } });
    const timer = setTimeout(() => finish(Error('Document inspection timed out. Export a simpler PDF.')), 20000);
    function finish(error, pages) { if (done) return; done = true; active--; clearTimeout(timer); worker.terminate(); error ? reject(Object.assign(error, { httpStatus: error.httpStatus || 400 })) : resolve(pages); }
    worker.on('message', data => finish(data.error ? Error(data.error) : null, data.pages));
    worker.on('error', () => finish(Error('Unable to inspect this document. Export a fresh PDF.')));
    worker.on('exit', () => { if (!done) finish(Error('Document inspection stopped. Export a simpler PDF.')); });
  });
}
if (!isMainThread) {
  (async () => {
    const pages = await require('../document-pages-core.js').count(workerData.bytes, workerData.name, require('pdf-lib'));
    if (pages !== null && !/\.pdf$/i.test(workerData.name)) {
      const sharp = require('sharp');
      const bytes = Buffer.from(workerData.bytes);
      const metadata = await sharp(bytes, { limitInputPixels: 50000000, failOn: 'warning' }).metadata();
      if ((metadata.pages || 1) !== pages || !metadata.width || !metadata.height || metadata.width * metadata.height > 50000000) throw Error('Image pages or dimensions could not be verified. Export to PDF.');
      await sharp(bytes, { limitInputPixels: 50000000, failOn: 'warning' }).resize(1, 1).raw().toBuffer();
    }
    parentPort.postMessage({ pages });
  })().catch(error => parentPort.postMessage({ error: /Export|export|PDF|pages/.test(error.message) ? error.message : 'This image is unreadable. Export a fresh PDF or image.' }));
}
module.exports = { inspectDocument };
