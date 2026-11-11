const {test} = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const {registerHealth, storageDiagnostic} = require('../server/service-health.cjs');
test('storage outage does not fail website liveness; readiness recovers separately', async () => {
  const app=express(); let ready=false; registerHealth(app,()=>ready);
  const server=app.listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+server.address().port;
  try {
    assert.equal((await fetch(base+'/healthz')).status,200);
    assert.equal((await fetch(base+'/readyz')).status,503);
    ready=true;
    assert.equal((await fetch(base+'/readyz')).status,200);
  } finally {await new Promise(r=>server.close(r));}
});
test('storage diagnostics never print arbitrary provider messages or secret codes',()=>{
  for(const code of ['401','403','404','400','unsafe-bucket-settings','SECRET'])
    assert.doesNotMatch(storageDiagnostic({code,message:'SECRET'}),/SECRET/);
});
