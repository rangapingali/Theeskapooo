// Local crash recovery. Hosting and a running computer/network are still required.
const { spawn } = require('node:child_process');
const path = require('node:path');
let child, stopping = false, failures = 0, timer;
function start() {
  const began = Date.now();
  child = spawn(process.execPath, [path.join(__dirname, 'index.cjs')], { cwd: path.join(__dirname, '..'), env: process.env, stdio: 'inherit', windowsHide: true });
  child.on('error', () => console.error('Could not start the application process.'));
  child.on('exit', code => {
    if (stopping) return;
    if (code === 78) { console.error('Port is already in use. Open the existing app or stop its server before restarting.'); process.exitCode = 1; return; }
    failures = Date.now() - began > 60000 ? 0 : failures + 1;
    const delay = Math.min(10000, 1000 * Math.max(1, failures));
    console.error('App stopped unexpectedly; restarting in ' + delay / 1000 + ' seconds.');
    timer = setTimeout(start, delay);
  });
}
function stop() {
  if (stopping) return;
  stopping = true; clearTimeout(timer);
  if (child && child.exitCode === null) child.kill('SIGTERM');
}
process.on('SIGINT', stop); process.on('SIGTERM', stop);
start();
