> Activation verified 4 October 2026: Supabase private bucket created; real upload, immutable retry, version-checked download and anonymous access denial passed. Test file deleted. Local server orders and manual payments enabled. Firebase Realtime Database and verified operator checks passed. Student end-to-end payment approval still needs user testing.

> Current storage setup: Supabase private storage replaces Firebase Storage. Follow [SUPABASE_SETUP.md](SUPABASE_SETUP.md). Firebase login and Singapore Realtime Database remain in use.

# Connect the Firebase backend

Project: `theeskapooooo-a04b4`. Hanish's operator email is configured locally as `b25ai163@kitsw.ac.in`; he must register and verify that mailbox. Student access is unchanged.

## Connection status (4 October 2026)

- Private credential path configured in the ignored `.env`; key contents were not copied into the project.
- Project matches and Hanish's account was confirmed registered, enabled and email-verified.
- Existing Singapore Realtime Database connected successfully. Firestore is not required.
- Supabase project URL is configured. Server secret key and private bucket verified.
- Firebase Storage/Blaze is no longer required. No billing changes were made.
- Realtime Database rules deployed and verified: anonymous access is denied. Supabase storage is activated; `KITSW_ENABLE_ORDERS=true` locally.

## Server credential (one-time local setup)

1. Open https://console.firebase.google.com/project/theeskapooooo-a04b4/settings/serviceaccounts/adminsdk
2. Under **Firebase Admin SDK**, choose **Generate new private key**. Complete this step yourself while signed into the project-owner account.
3. Save the downloaded JSON in a private folder outside the project and outside OneDrive, for example `C:/Users/monic/firebase-private/kitsw-admin.json`.
4. Provide only that file path to the assistant. Never paste the JSON/private key in chat, browser scripts or a repository.

The backend uses `GOOGLE_APPLICATION_CREDENTIALS` in the ignored `.env` file to locate this credential. For hosted production use a managed service identity instead of copying a local key to public hosting.

## Checks and service activation

`npm run backend:check` checks server access to Realtime Database, the Storage bucket, and the configured operator's verified account without printing tokens or private-key contents. A missing credential is reported before any cloud request.

The remaining service setup is: save the Supabase server key, run storage:setup, verify private uploads/downloads, then enable `KITSW_ENABLE_ORDERS`. Realtime Database rules have already been deployed after confirming only public test-mode rules existed. No existing application data was modified.

Supabase free storage is selected for the pilot. See SUPABASE_SETUP.md for limits and retention.

The official Firebase CLI is a project development dependency. Use `npm run firebase:login` for CLI authentication when needed. Local rule-deployment configuration is in `firebase.json` and `.firebaserc`; `npm run firebase:deploy-rules` is the explicit deployment command, not an automatic startup step.

Manual UPI mode does not need Razorpay keys. After cloud setup, verified students can submit orders, Hanish can approve quotes and confirm receipt, and the student sees paid status only after that confirmation. UPI ID/name are not automatically bank-verified.

## Realtime Database implementation

Orders, receipt uniqueness records, quotas and audit records live under `/kitswApp`. The server uses Firebase REST conditional requests (ETag/If-Match), retrying conflicts and committing related changes atomically. Browser database access is denied; students use authenticated backend routes.

This initial implementation reads the app subtree for transactions and filters order lists on the server. It is suitable for functional testing, but needs partitioned transactions, indexed list queries, retention/archival and load testing before a rollout to 2,000 students. No production capacity claim is made. Legacy Firestore rule/index files are unused.
