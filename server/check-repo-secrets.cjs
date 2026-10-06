// Read-only audit. Reports paths and rule names, never matched secret values.
const fs = require('node:fs');
const {execFileSync} = require('node:child_process');
const git = process.platform === 'win32' && fs.existsSync('C:/Program Files/Git/cmd/git.exe') ? 'C:/Program Files/Git/cmd/git.exe' : 'git';
const run = args => execFileSync(git,args,{encoding:'utf8',maxBuffer:64*1024*1024});
const patterns = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['service account', /"type"\s*:\s*"service_account"/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})\b/],
  ['Supabase secret', /\bsb_secret_[A-Za-z0-9_-]{20,}\b/],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['JWT credential', /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/]
];
if(fs.existsSync('.env')) for(const line of fs.readFileSync('.env','utf8').split(/\r?\n/)) {
  const match=line.match(/^([A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD)[A-Z0-9_]*)=(.+)$/);
  if(match) {const value=match[2].trim().replace(/^['"]|['"]$/g,'');if(value.length>=12)patterns.push(['configured '+match[1],{test:text=>text.includes(value)}]);}
}
let failures=0, checked=0;
function scan(label,bytes) {
  if(bytes.includes('\0'))return;
  checked++;
  for(const [rule,pattern] of patterns) if(pattern.test(bytes)){console.error(label+': '+rule); failures++;}
}
const paths=run(['ls-files','-z','--cached','--others','--exclude-standard']).split('\0').filter(Boolean);
for(const file of new Set(paths)) {
  if(/(^|\/)\.env($|\.)/.test(file)&&file!=='.env.example'){console.error(file+': environment file included');failures++;}
  if(fs.existsSync(file)&&fs.statSync(file).isFile())scan(file,fs.readFileSync(file,'utf8'));
}
// Audit all reachable commits, including files removed from the working tree.
const objects=run(['rev-list','--objects','--all']).trim().split('\n').filter(Boolean);
for(const line of objects) {
  const space=line.indexOf(' '); if(space<0)continue;
  const oid=line.slice(0,space),file=line.slice(space+1);
  if(run(['cat-file','-t',oid]).trim()!=='blob')continue;
  if(/(^|\/)\.env($|\.)/.test(file)&&file!=='.env.example'){console.error('history/'+file+': environment file committed');failures++;}
  scan('history/'+file,run(['cat-file','blob',oid]));
}
console.log(`Checked ${checked} text files/blobs; ${failures} possible secret exposures. Firebase browser API configuration is public, not an Admin credential.`);
process.exitCode=failures?1:0;
