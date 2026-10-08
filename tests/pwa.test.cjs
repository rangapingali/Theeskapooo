const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('PWA manifest declares a standalone app with valid install icons', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.start_url, './index.html');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  assert.deepEqual(manifest.icons.map(icon => icon.sizes), ['192x192', '512x512']);
  for (const icon of manifest.icons) {
    const image = fs.readFileSync(path.join(root, icon.src.slice(2)));
    assert.equal(image.toString('hex', 0, 8), '89504e470d0a1a0a');
    assert.equal(image.readUInt32BE(16), Number.parseInt(icon.sizes, 10));
    assert.equal(image.readUInt32BE(20), Number.parseInt(icon.sizes, 10));
  }
});

test('app pages register a network-only service worker and publish all PWA assets', () => {
  for (const file of ['index.html', 'dashboard.html', 'operator.html', 'earnings.html', 'trending.html']) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(html, /rel="manifest" href="manifest\.webmanifest"/, file);
    assert.match(html, /src="pwa\.js" defer/, file);
  }

  const worker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
  assert.match(worker, /event\.respondWith\(fetch\(event\.request\)\)/);
  assert.doesNotMatch(worker, /caches\.(?:open|match|keys|delete)/);

  const build = fs.readFileSync(path.join(root, 'server', 'build-web.cjs'), 'utf8');
  for (const file of ['manifest.webmanifest', 'service-worker.js', 'pwa.js', 'pwa-icon-192.png', 'pwa-icon-512.png']) {
    assert.ok(build.includes(`'${file}'`), `${file} is included in the static build`);
  }
});
