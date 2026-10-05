const { Readable } = require('node:stream');
const { createClient } = require('@supabase/supabase-js');
const MAX_FILE_BYTES = 25 * 1024 * 1024;
function createDocumentStorage(env = process.env, client) {
  if (!client && (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY)) throw Object.assign(new Error('Save SUPABASE_URL and SUPABASE_SECRET_KEY in the server .env first.'), { code: 'supabase-not-configured' });
  client ||= createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const name = env.SUPABASE_BUCKET || 'print-documents';
  const objects = client.storage.from(name);
  const unwrap = result => { if (result.error) throw Object.assign(new Error('Private document storage request failed.'), { code: String(result.error.statusCode || 'storage-error') }); return result.data; };
  async function metadata(path) {
    const info = unwrap(await objects.info(path));
    if (!info.id || !info.version) throw new Error('Storage did not return a document version.');
    return { size: Number(info.size ?? info.metadata?.size), contentType: info.contentType ?? info.metadata?.mimetype, generation: info.id + ':' + info.version };
  }
  return {
    async check() {
      const bucket = unwrap(await client.storage.getBucket(name));
      if (bucket.public || !Number(bucket.file_size_limit) || Number(bucket.file_size_limit) > MAX_FILE_BYTES) throw Object.assign(new Error('Bucket must be private with a maximum file size of 25 MB.'), { code: 'unsafe-bucket-settings' });
      return bucket;
    },
    async setup() {
      const found = await client.storage.getBucket(name);
      if (found.error) {
        if (!['404', '400'].includes(String(found.error.statusCode)) || !/not found/i.test(found.error.message)) unwrap(found);
        unwrap(await client.storage.createBucket(name, { public: false, fileSizeLimit: MAX_FILE_BYTES, allowedMimeTypes: ['application/octet-stream'] }));
      }
      return this.check();
    },
    async upload(path, bytes) {
      if (!bytes.length || bytes.length > MAX_FILE_BYTES) throw new Error('Document exceeds file size limit.');
      const result = await objects.upload(path, bytes, { contentType: 'application/octet-stream', upsert: false });
      if (result.error && !['409', '400'].includes(String(result.error.statusCode))) unwrap(result);
      if (result.error) {
        // Retry only succeeds when the immutable existing object has identical bytes.
        const blob = unwrap(await objects.download(path));
        if (!Buffer.from(await blob.arrayBuffer()).equals(bytes)) throw Object.assign(new Error('A different document already exists. Start a new order.'), { httpStatus: 409 });
      }
      return metadata(path);
    },
    async remove(paths) { if (paths.length) unwrap(await objects.remove(paths)); },
    file(path, options = {}) {
      return {
        getMetadata: async () => [await metadata(path)],
        createReadStream: () => Readable.from((async function* () {
          const current = await metadata(path);
          if (options.generation && current.generation !== options.generation) throw new Error('Document changed after order submission.');
          const blob = unwrap(await objects.download(path));
          yield Buffer.from(await blob.arrayBuffer());
        })())
      };
    }
  };
}
module.exports = { createDocumentStorage, MAX_FILE_BYTES };
