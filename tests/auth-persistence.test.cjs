const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
test('auth uses durable local persistence and ordinary requests do not reload the Firebase user',async()=>{
 let persistence,reloads=0;const user={email:'student@kitsw.ac.in'},auth={currentUser:user,authStateReady:async()=>{}};
 const sdk={getAuth:()=>auth,browserLocalPersistence:{kind:'local'},browserSessionPersistence:{kind:'session'},setPersistence:async(a,p)=>{persistence=p;},reload:async()=>{reloads++;},getIdToken:async()=>'',signOut:async()=>{auth.currentUser=null;}};
 const appSdk={getApps:()=>[{}],getApp:()=>({})};
 const source=fs.readFileSync('auth-service.js','utf8').replace(/import\('https:\/\/www.gstatic.com\/firebasejs\/[^']+\/firebase-app.js'\)/,'Promise.resolve(mockAppSdk)').replace(/import\('https:\/\/www.gstatic.com\/firebasejs\/[^']+\/firebase-auth.js'\)/,'Promise.resolve(mockAuthSdk)');
 const sandbox={window:{KITSW_FIREBASE_CONFIG:{apiKey:'example',authDomain:'example',projectId:'example',appId:'example'}},mockAuthSdk:sdk,mockAppSdk:appSdk};vm.runInNewContext(source,sandbox);
 const service=sandbox.window.KitswAuth;assert.equal(await service.current(),user);assert.equal(await service.current(),user);assert.equal(persistence.kind,'local');assert.equal(reloads,0);
 await service.refresh();assert.equal(reloads,1);await service.logout();assert.equal(await service.current(),null);
});
