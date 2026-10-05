const {GoogleAuth}=require('google-auth-library');
(async()=>{
 const auth=new GoogleAuth({keyFilename:process.env.GOOGLE_APPLICATION_CREDENTIALS,scopes:['https://www.googleapis.com/auth/cloud-platform']});
 const client=await auth.getClient(); const id=process.env.FIREBASE_PROJECT_ID;
 const base=`https://firestore.googleapis.com/v1/projects/${id}`;
 try {
  const list=await client.request({url:base+'/databases',timeout:20000});
  if((list.data.databases||[]).some(d=>d.name.endsWith('/(default)'))) {console.log('Default database already exists; leaving it unchanged.');return;}
  const created=await client.request({url:base+'/databases',method:'POST',params:{databaseId:'(default)'},data:{locationId:'asia-south1',type:'FIRESTORE_NATIVE',databaseEdition:'STANDARD',deleteProtectionState:'DELETE_PROTECTION_ENABLED'},timeout:30000});
  console.log('Firestore creation requested:',created.data.name);
 }catch(e){console.log('Firestore setup:',JSON.stringify({status:e.response?.status,message:e.response?.data?.error?.message||'Request failed'}));process.exitCode=1;}
})();
