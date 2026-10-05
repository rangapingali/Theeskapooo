const fs=require('fs');
const {GoogleAuth}=require('google-auth-library');
(async()=>{
const auth=new GoogleAuth({keyFilename:process.env.GOOGLE_APPLICATION_CREDENTIALS,scopes:['https://www.googleapis.com/auth/cloud-platform']});
const client=await auth.getClient();
const id=process.env.FIREBASE_PROJECT_ID;
for(const [name,url] of [['Firestore databases',`https://firestore.googleapis.com/v1/projects/${id}/databases`],['Billing status',`https://cloudbilling.googleapis.com/v1/projects/${id}/billingInfo`]]){
try{const r=await client.request({url,timeout:20000});console.log(name,JSON.stringify(r.data));}catch(e){console.log(name,JSON.stringify({status:e.response?.status,message:e.response?.data?.error?.message||'Request failed'}));}
}
})();
