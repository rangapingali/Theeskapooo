importScripts('/vendor/pdf-lib.min.js', '/document-pages-core.js');
self.onmessage = async ({ data }) => {
  try { self.postMessage({ pages: await DocumentPagesCore.count(data.bytes, data.name, PDFLib) }); }
  catch (error) { self.postMessage({ error: error.message }); }
};
