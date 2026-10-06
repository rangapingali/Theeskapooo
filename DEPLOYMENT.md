# Free deployment of THEESKAPOOO

Use one **Render Web Service** for both the website and Express API, with the existing Firebase Authentication/Realtime Database and private Supabase storage. No Netlify deployment, new Firebase project, Render database, paid disk or domain purchase is needed for this route. Existing student accounts and orders stay in the same Firebase project.

This is a free pilot setup, not a guarantee of uninterrupted campus-scale service. Limits below were checked on 6 October 2026.

## 1. Confirm the code is on GitHub

Repository: `rangapingali/Theeskapooo`, branch `main`.

Push the latest application changes and this guide. Keep the repository private if you do not want the source public. Do not add `.env`, service-account JSON, student files or logs. The public Firebase browser configuration identifies the app; it is not an Admin credential.

From the project directory you can run:

```powershell
node server/check-repo-secrets.cjs
npm test
git status --short
```

The scanner checks working files and reachable Git history for common credential patterns and configured secrets. It is a useful check, not a guarantee that every possible secret format is detected. If a real secret was ever pushed, revoke/rotate it; merely deleting it in a later commit does not remove it from history.

## 2. Create the Render service

Open https://dashboard.render.com and sign in using the GitHub account that owns the repository. Authorize access only to this repository where possible. Choose **New → Web Service**, connect the repository and enter:

| Setting | Value |
| --- | --- |
| Name | `theeskapooo` (or another available name) |
| Language/runtime | Node |
| Branch | `main` |
| Region | Singapore, if available on Free |
| Root directory | Leave blank |
| Build command | `npm ci --omit=dev` |
| Start command | `node server/index.cjs` |
| Instance type | **Free** |
| Health check path | `/healthz` |

There is no publish directory for a Web Service. Render supplies the `PORT`; do not copy the local `PORT=4174`. `HOST=0.0.0.0` below lets Render reach the app. The production start command runs the server directly; Render manages the process. The optional `render.yaml` contains the same service configuration for Blueprint users; use either manual setup or a Blueprint, not both.

## 3. Add server environment variables

Under Render's **Environment**, set the following. Keep `KITSW_ENABLE_ORDERS=false` during the initial deployment so the pages can load before credentials are installed.

| Key | Value |
| --- | --- |
| `NODE_VERSION` | `22` |
| `NODE_ENV` | `production` |
| `HOST` | `0.0.0.0` |
| `KITSW_ENABLE_ORDERS` | `false` initially; change to `true` in step 5 |
| `FIREBASE_PROJECT_ID` | `theeskapooooo-a04b4` |
| `FIREBASE_DATABASE_URL` | `https://theeskapooooo-a04b4-default-rtdb.asia-southeast1.firebasedatabase.app` |
| `GOOGLE_APPLICATION_CREDENTIALS` | `/etc/secrets/firebase-admin.json` |
| `SUPABASE_URL` | `https://iopzmdjsfgnmbqckkjcb.supabase.co` |
| `SUPABASE_BUCKET` | `print-documents` |
| `SUPABASE_SECRET_KEY` | Copy the existing value from local `.env` directly into Render |
| `PRINT_OPERATOR_EMAILS` | Copy the verified operator email from local `.env` |
| `PAYMENT_MODE` | `self_declared` |
| `MERCHANT_NAME` | `THEESKAPOOO` |
| `MERCHANT_UPI_REFERENCE` | Copy the existing recipient UPI ID from local `.env` |
| `MERCHANT_UPI_ACCOUNT_NAME` | Copy the existing recipient name from local `.env` |

Do not paste the whole local `.env` without review: its Windows credential path and local port are not the cloud settings. Do not send secret values in chat, screenshots, GitHub issues, or code. No Razorpay keys or Firebase Storage billing are needed for this configuration.

## 4. Install the Firebase credential as a secret file

In the Render service, open **Environment → Secret Files → Add Secret File**:

- Filename: `firebase-admin.json`
- Contents: the entire existing Firebase Admin JSON from the private folder on your computer. Open it locally and paste directly into the Render secret-file editor; preserve the JSON and escaped newlines.

The file must belong to `theeskapooooo-a04b4`. Render mounts it at `/etc/secrets/firebase-admin.json`. Do not upload it to the GitHub repository or put its contents inside an environment variable intended for a filename. Keep account access restricted; enable two-factor authentication for GitHub and hosting accounts.

## 5. Enable the backend

Confirm the Supabase project is active. Its `print-documents` bucket must remain **private**, with a **25 MB** file limit. Do not add public read/write policies to solve an upload error.

Firebase Realtime Database must retain the deny-by-default rules in `database.rules.json`; trusted Admin requests run through the server. Do not enable public `.read` or `.write`.

After the secret file and variables are saved, change `KITSW_ENABLE_ORDERS` to `true` and select **Save, rebuild, and deploy** (or the equivalent deploy action). Wait until the deployment is Live. Render assigns an HTTPS address such as `https://theeskapooo.onrender.com`; use the actual URL displayed in your dashboard because the exact name may differ.

## 6. Allow the deployed domain in Firebase

In Firebase Console → Authentication → Settings → Authorized domains, add the exact Render hostname, for example `theeskapooo.onrender.com`, without `https://` or a path. Keep the existing Firebase auth domain. Existing users can log in with their existing accounts; the new website origin may require a fresh login once.

Test verification and password-reset emails on the deployed site. If you previously restricted the public Firebase browser API key by HTTP referrer, add the new site URL to those restrictions rather than removing the restrictions.

## 7. Verify before sharing

Replace `YOUR-APP` below with the real hostname:

- `https://YOUR-APP.onrender.com/healthz` should return `{"status":"ready"}`.
- `/api/config` should show `ordersEnabled:true`, `paymentsEnabled:true`, `paymentMode:"self_declared"`.
- `/.env`, `/server/index.cjs` and `/firebase-admin.json` must return 404.
- An ordinary verified student should not see or access the operator dashboard.
- Upload a small non-sensitive PDF, check its page count/price, open checkout and close it: no order should have been created.
- For an actual test purchase, pay the displayed amount, then tick confirmation and select Done. Confirm one order and one collection code appear. Do not declare a transfer you have not made.
- Use the operator account to download that document, start printing, mark ready and hand over. Check the student sees Ready to collect and the operator's handed-over card moves to history.
- Check shop pause/resume and sign-out. Do not use personal student documents for the first test.

The current payment checkbox is **student-declared payment**, not confirmation from a bank. HTTPS protects transport; it does not prove the transfer happened. Until a verified merchant gateway replaces this flow, limit it to trusted testing.

## Free limits and retention

- Render Free sleeps after 15 minutes without incoming traffic. Waking it takes about a minute. Do not use artificial keep-alive traffic to defeat the free plan's idle behavior.
- Render includes 750 free instance hours per workspace/month and has bandwidth/build limits. Heavy requests to Firebase or Supabase can also trigger a service-initiated traffic suspension. Keep the instance Free, avoid paid add-ons, review usage, and avoid adding a payment method if you want overages to suspend services rather than incur charges. If account verification requires a payment method, review the billing controls before proceeding; no promise of unlimited free usage is possible.
- Supabase Free includes 1 GB of file storage and limited egress. At 5 MB per document, 200 documents use roughly 1 GB before overhead; downloads also consume bandwidth. Low-activity free projects can pause after a 7-day period. Watch the dashboard and pausing emails.
- Keep Firebase on Spark to stay within its no-cost quotas. Do not enable Blaze just for this setup. Firebase and Supabase quota exhaustion can interrupt the app independently of Render.
- Data lives in Firebase and Supabase, not Render's temporary disk. A Render restart does not itself delete saved orders or documents.
- Cleanup runs when the server starts and hourly while it is awake. Files become eligible 24 hours after collection/cancellation; abandoned uploads after 48 hours. If Render sleeps, deletion waits until the service wakes. This setup cannot promise deletion at exactly the 24-hour mark. Orders that never reach collected/cancelled remain stored.
- Start with a small pilot and observe usage/response times. This free setup has not been load-tested for 2,000 concurrent students.

## Deployment checks performed

Firebase Admin was updated to 14.5.0. All 69 application tests passed after the update, and read-only checks passed for the existing Singapore Realtime Database, private Supabase bucket and verified operator account. The repository credential-pattern scan found no matches. These are local/backend checks, not proof that the Render deployment has completed.

The production dependency audit still reports two moderate findings in the transitive `uuid`/`gaxios` dependency chain. It reports no high or critical production findings. A compatible `npm audit fix` did not eliminate the remaining advisory; do not blindly use `--force` before deploying. The full development-tool audit also reports findings, including high-severity ones; the documented `npm ci --omit=dev` excludes those development tools from Render. This is not a clean security certification. Recheck dependencies before a broad rollout; use the deployment as a trusted pilot while these findings and merchant payment verification remain outstanding.

## If deployment fails

| Symptom | Check |
| --- | --- |
| No open port / service unreachable | Web Service selected, start command correct, `HOST=0.0.0.0`, no hard-coded `PORT` |
| Credential file missing / startup crash | Secret filename, full valid JSON and `/etc/secrets/firebase-admin.json` match |
| Storage reconnecting / health check 503 | Supabase project active, secret valid, bucket private and file limit 25 MB |
| Pages load but orders disabled | `KITSW_ENABLE_ORDERS=true`, deployed after saving variables, storage check passed |
| Orders fail despite healthz ready | Check Firebase Admin permissions, database URL, and operator verification; healthz does not fully test all dependencies |
| Auth fails | Firebase Email/Password enabled, authorized hostname, API-key referrer restrictions, account email verification |
| First page slow after inactivity | Expected Free-plan wake-up; give it about a minute |

Share only the public service URL and redacted error messages for troubleshooting. Never share the secret file or environment-variable values.

## Official references

- Render service setup: https://render.com/docs/web-services
- Render secret files and environment: https://render.com/docs/configure-environment-variables
- Render Free limitations: https://render.com/docs/free
- Supabase Free quotas: https://supabase.com/docs/guides/platform/billing-on-supabase
- Supabase pausing: https://supabase.com/docs/guides/platform/free-project-pausing
- Firebase email action domains: https://firebase.google.com/docs/auth/web/passing-state-in-email-actions
