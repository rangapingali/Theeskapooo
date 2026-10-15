const {test}=require('node:test'),assert=require('node:assert/strict');
const {isAdmin}=require('../server/access-roles.cjs'),{isOperator}=require('../server/manual-payments.cjs');
test('retired operator remains a student even with stale server configuration',()=>{assert.equal(isOperator({email:'b25ai163@kitsw.ac.in',email_verified:true},'b25ai163@kitsw.ac.in'),false);});
test('administrator role is separate and requires verified explicitly configured identity',()=>{
 const env={PRINT_ADMIN_EMAILS:'admin@kitsw.ac.in'},token={email:'admin@kitsw.ac.in',email_verified:true};
 assert.equal(isAdmin(token,env),true);assert.equal(isAdmin({...token,email_verified:false},env),false);assert.equal(isAdmin({...token,email:'shop@kitsw.ac.in'},env),false);assert.equal(isOperator(token,'shop@kitsw.ac.in'),false);
});
test('admin endpoints reject non-admin requests',()=>{const routes={};require('../server/admin-routes.cjs')({use:(p,f)=>routes[p]=f,get:()=>{},post:()=>{}},{env:{PRINT_ADMIN_EMAILS:'admin@kitsw.ac.in'}});let error;routes['/api/admin']({student:{email:'shop@kitsw.ac.in',email_verified:true}},{},e=>error=e);assert.equal(error.httpStatus,403);});

test('verified owner Gmail gets staff access but an unverified or different Gmail does not',()=>{
 const roles=require('../server/access-roles.cjs');const owner={email:'rangapingali@gmail.com',email_verified:true};
 assert.equal(roles.isAdmin(owner,{}),true);assert.equal(roles.isStaff(owner,{}),true);
 assert.equal(roles.isAdmin({...owner,email_verified:false},{}),false);
 assert.equal(roles.isStaff({...owner,email:'someone@gmail.com'},{}),false);
});
