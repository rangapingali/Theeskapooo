> Current storage setup: Supabase private storage replaces Firebase Storage. Follow [SUPABASE_SETUP.md](SUPABASE_SETUP.md). Firebase login and Singapore Realtime Database remain in use.

# KITSW Xerox — Tech Titans

Open `index.html` with VS Code Live Server. `college-source.html` redirects to it for older preview links.

## Enable real accounts

The UI and Firebase Authentication adapter are implemented, and the public web configuration for `theeskapooooo-a04b4` is installed. Email/Password provider settings and actual email delivery still need to be verified in Firebase and with a college mailbox. There is no fake local-password database. Database, Storage and Analytics are not initialized by this authentication step.

1. Create a Firebase project at https://console.firebase.google.com/ and register a Web app. Analytics is optional and is not used by this app.
2. Copy the public web configuration values (`apiKey`, `authDomain`, `projectId`, `appId`) from Project settings into `firebase-config.js`. These identify the client app; never use service-account credentials or a private key.
3. Enable Authentication > Sign-in method > Email/Password.
4. Configure the password policy to require at least 8 characters, uppercase, lowercase and a number, matching the registration form. Enable email enumeration protection where available.
5. Add your development and production hostnames under Authentication > Settings > Authorized domains. Add `localhost` if needed. Run through an HTTP local server and use HTTPS in production.
6. Review the verification and password-reset email templates. The app uses Firebase's default hosted email action handler. Students follow the email link, return to the app, and select **I've verified my email**.
7. Test with a college mailbox you control: register, receive verification, verify, refresh status, sign out, sign in, reset password, and sign in with the new password. Check incorrect-password and offline cases too.

Authentication uses session persistence: Firebase manages the session token for this tab/session. App code never stores or logs passwords, and clears password inputs after submission and when switching screens.

## Rollout for about 2,000 students

The Spark plan currently lists 1,000 address-verification emails/day and 150 password-reset emails/day. Account creation is limited to 100 accounts/hour/IP. Spread onboarding over several days to allow retries, and monitor delivery. Firebase Authentication with Identity Platform on Spark additionally has a 3,000 daily-active-user limit. Recheck quotas before launch; do not enable billing without the project owner's decision.

Document storage, downloads and database usage are separate services and costs. The student dashboard and backend are now implemented; see [DASHBOARD_SETUP.md](DASHBOARD_SETUP.md) for activation and the remaining cloud/payment setup. They have not been deployed or activated.

## Authorization before adding orders or documents

The email-domain check in JavaScript is user feedback, not a security boundary. Before enabling any order/file API, enforce the following on the server or in deployed Firebase Security Rules: verified email claim, exact `kitsw.ac.in` domain, and user ownership of each order/document. Shop staff access must use a server-assigned role, never a role selected in the browser. Firebase Authentication itself can still accept account requests made outside this UI; use server-side blocking controls if preventing all outside-domain account creation is required.

Do not publish Realtime Database or Storage with test-mode/public rules. No databases, storage buckets, or rules are deployed by this change.

## Files

- `index.html`, `styles.css`, `app.js`: responsive login, registration, reset and account-status screens.
- `auth-service.js`: replaceable Firebase adapter; pinned modular SDK loaded from Google's CDN only when configured.
- `firebase-config.js`: public project configuration.
- `tech-titans.svg`: editable vector logo: twin-T shield, forest green and sage wordmark.

## References

- https://firebase.google.com/docs/auth/web/password-auth
- https://firebase.google.com/docs/auth/web/manage-users
- https://firebase.google.com/docs/auth/limits
- https://firebase.google.com/docs/web/alt-setup
