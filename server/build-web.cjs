// Publish only reviewed browser assets. Never publish the repository root.
const fs = require('node:fs');
const path = require('node:path');
const root = fs.realpathSync(path.resolve(__dirname, '..'));
const output = path.join(root, 'dist');
// Validate the exact destination before clearing generated output, including links.
if (path.dirname(output) !== root || path.basename(output) !== 'dist') throw Error('Unsafe build directory');
if (fs.existsSync(output) && (fs.lstatSync(output).isSymbolicLink() || fs.realpathSync(output) !== output)) throw Error('Build directory must not be a link');
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(path.join(output, 'vendor'), { recursive: true });
const publicFiles = [
  'index.html', 'college-source.html', 'dashboard.html', 'operator.html',
  'styles.css', 'dashboard.css', 'app.js', 'auth-service.js', 'firebase-config.js',
  'print-core.js', 'order-service.js', 'dashboard.js', 'operator.js', 'order-alerts.js',
  'document-pages.js', 'document-pages-core.js', 'document-pages-worker.js',
  'tech-titans.svg', 'kitsw-logo.jpg', 'theeskapooo-logo.svg', 'theeskapooo-icon.svg',
  'notification-voice.mp3'
];
for (const file of publicFiles) fs.copyFileSync(path.join(root, file), path.join(output, file));
fs.copyFileSync(path.join(root, 'node_modules/pdf-lib/dist/pdf-lib.min.js'), path.join(output, 'vendor/pdf-lib.min.js'));
console.log('Built dist with browser assets only. A separately deployed API is required for live orders.');
