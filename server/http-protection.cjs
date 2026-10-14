// Same-origin API protection and bounded, per-process abuse controls.
function securityHeaders(req, res, next) {
  const gateway = ['test', 'live'].includes(process.env.PAYMENT_MODE);
  const provider = gateway ? ' https://*.razorpay.com' : '';
  res.set({
    'Content-Security-Policy': [
      "default-src 'self'", "base-uri 'none'", "object-src 'self' blob:", "frame-ancestors 'self'",
      "script-src 'self' https://www.gstatic.com" + provider,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com", "img-src 'self' data: blob:" + provider,
      "media-src 'self' blob:", "worker-src 'self'", "frame-src 'self' blob: https://*.firebaseapp.com" + provider,
      "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com https://*.firebaseapp.com" + provider + (process.env.BROTHER_TEST_BRIDGE === 'true' ? ' http://127.0.0.1:4179' : ''),
      "form-action 'self'" + provider
    ].join('; '),
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'SAMEORIGIN', 'Cross-Origin-Resource-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
    'X-DNS-Prefetch-Control': 'off'
  });
  if (req.secure) res.set('Strict-Transport-Security', 'max-age=31536000');
  next();
}
function sameOrigin(req, res, next) {
  if (req.path === '/payment-webhook') return next(); // Verified by gateway HMAC.
  const origin = req.get('origin');
  let foreign = req.get('sec-fetch-site') === 'cross-site';
  if (origin) {
    try { const url = new URL(origin); foreign ||= !['http:', 'https:'].includes(url.protocol) || url.host !== req.get('host'); }
    catch { foreign = true; }
  }
  if (foreign) return res.status(403).json({ error: 'Open THEESKAPOOO directly to make this request.' });
  next();
}
function rateLimit({ limit = 300, windowMs = 60000, maxKeys = 10000, now = Date.now } = {}) {
  const buckets = new Map();
  return (req, res, next) => {
    const time = now(), key = req.ip || req.socket?.remoteAddress || 'unknown';
    let bucket = buckets.get(key);
    if (!bucket || bucket.until <= time) {
      if (buckets.size >= maxKeys) {
        for (const [id, value] of buckets) if (value.until <= time) buckets.delete(id);
        if (buckets.size >= maxKeys) return res.status(503).json({ error: 'The service is busy. Please retry shortly.' });
      }
      bucket = { count: 0, until: time + windowMs }; buckets.set(key, bucket);
    }
    if (++bucket.count > limit) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((bucket.until - time) / 1000))));
      return res.status(429).json({ error: 'Too many requests from this connection. Wait a minute and retry.' });
    }
    next();
  };
}
function uploadSlots(maximum = 2) {
  let active = 0;
  return (req, res, next) => {
    if (active >= maximum) { res.set('Retry-After', '5'); return res.status(429).json({ error: 'Uploads are busy. Your files are safe on your device; retry in a moment.' }); }
    active++; let released = false;
    const release = () => { if (!released) { released = true; active--; } };
    res.once('finish', release); res.once('close', release); next();
  };
}
module.exports = { securityHeaders, sameOrigin, rateLimit, uploadSlots };
