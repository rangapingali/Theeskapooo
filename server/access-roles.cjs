const inList=(token,emails='')=>token?.email_verified===true&&emails.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean).includes((token.email||'').toLowerCase());
const isAdmin=(token,env=process.env)=>inList(token,env.PRINT_ADMIN_EMAILS||'rangapingali@gmail.com');
// Retired operator identity stays a student even if an old Render variable remains.
const isRetiredOperator=token=>(token?.email||'').toLowerCase()==='b25ai163@kitsw.ac.in';
module.exports={inList,isAdmin,isRetiredOperator};

const isStaff = (token,env=process.env) => !isRetiredOperator(token) && (isAdmin(token,env) || inList(token,env.PRINT_OPERATOR_EMAILS||''));
module.exports.isStaff=isStaff;
