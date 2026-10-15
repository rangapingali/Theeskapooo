# Shop and admin access

Current owner: rangapingali@gmail.com. This verified account has both admin and shop access. Hanish (b25ai163@kitsw.ac.in) is student-only, even if an obsolete operator environment variable still lists him.

Open /staff.html. If an account already exists, sign in or use Forgot password. Otherwise choose Create my account, set a unique app password (12+ characters), verify the email, then choose I verified my email. The two dashboard links appear after server authorization.

No password is stored in source control or supplied in chat. Do not use the Gmail password as the app password.

PRINT_ADMIN_EMAILS can explicitly override the default owner in server environment. PRINT_OPERATOR_EMAILS adds shop operators without giving them admin access. Remove the obsolete Hanish entry in Render when convenient; the server already denies that identity operator access. Do not add ordinary student addresses to these variables.

The current staff login permits the designated Gmail owner and college emails. When the shop supplies its actual email, update the permitted staff identity and server role configuration together. Do not mark an email verified on somebody's behalf. Email verification proves mailbox ownership.

Admin overview contains order search, recorded daily online/cash totals, shop pause/resume and audited admin availability changes. Declared payments are not bank-verified. Infrastructure quotas, provider failures and billing still need monitoring in Render, Firebase and Supabase consoles.
