function registerHealth(app, ready) {
  // Render checks whether this process can serve the website. Storage readiness
  // gates order APIs separately: restarting the process cannot restore a paused project.
  app.get('/healthz', (req, res) => res.set('Cache-Control', 'no-store').status(200).json({ status: 'alive' }));
  app.get('/readyz', (req, res) => res.set('Cache-Control', 'no-store').status(ready() ? 200 : 503).json({ status: ready() ? 'ready' : 'reconnecting' }));
}
function storageDiagnostic(error) {
  const code = String(error?.code || '');
  if (code === 'unsafe-bucket-settings') return 'Bucket must be private with a maximum file size of 25 MB.';
  if (['401', '403'].includes(code)) return 'Storage authorization failed. Check the server secret key and project.';
  if (['400', '404'].includes(code)) return 'Check that the Supabase project is active and the configured private bucket exists.';
  return 'Check Supabase project status, server storage configuration and network access.';
}
module.exports = { registerHealth, storageDiagnostic };
