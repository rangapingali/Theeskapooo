> Current storage setup: Supabase private storage replaces Firebase Storage. Follow [SUPABASE_SETUP.md](SUPABASE_SETUP.md). Firebase login and Singapore Realtime Database remain in use.

﻿# Student dashboard and order service

## Try it now

Open `dashboard.html?preview=1` through Live Server, or use **Explore the dashboard preview** on the login page. Preview orders exist only in memory. Files stay on the device, no payment is possible, and refreshing clears new preview orders. The ready-to-collect example is clearly labelled DEMO.

For the application server:

```powershell
npm install
npm start
```

Then visit http://localhost:4174/dashboard.html?preview=1. A verified student can open the live dashboard from the login screen. Until cloud services are configured, the live dashboard allows preparation but disables order submission.

## What is implemented

- Multiple files; 10 per order, 25 MB each, 100 MB total.
- PDF, Office/OpenDocument, text/CSV and common image formats. Executables, HTML, SVG and archives are not printable uploads; export other formats to PDF.
- Basic filename, size and format information; local PDF/image/text preview. Office/HEIC/TIFF visual preview requires conversion and is not provided yet.
- Per-file copies, B&W/colour, duplex, paper size, orientation, page range, pages per side and finishing.
- Manual page counts (images default to one). The shop must check final pagination before quoting.
- A4 B&W ₹5 and colour ₹10 per printed side, as supplied by the team. Other sizes and binding are marked quote-required. No duplex discount or extra fees are invented.
- Printing-time estimates use assumed throughput (15 B&W sides/minute or 5 colour sides/minute) plus a finishing allowance. They are not measured shop queue times or pickup promises.
- One centre: Tech-Titans-Xerox. Normal 09:00–17:30; exam days 08:30–17:30, Asia/Kolkata. The exam calendar/closed days are not supplied; requests before 09:00 require shop confirmation.
- Offline or online-after-quote payment preference. Offline orders can still be paid online before collection.
- Server-backed order list and status polling every 30 seconds while visible; submitted, accepted, printing, ready, collected and cancelled states.

## Activate real orders

1. Complete Firebase Authentication setup first.
2. Use the existing Singapore Realtime Database and the Supabase private bucket described in SUPABASE_SETUP.md.
3. Realtime Database rules deny browser access. Supabase uploads and operator downloads go through authenticated backend routes. Do not deploy legacy Firebase storage.rules.
4. Configure the Node server with Application Default Credentials or a managed service identity with appropriate Firebase Admin permissions. Keep credentials outside the public project directory; do not paste service-account private keys into the chat or browser code.
5. Copy `.env.example` to `.env` locally and set `KITSW_ENABLE_ORDERS=true` only after the above services and rules are ready. The server serves an explicit allowlist of public assets, not its own code or environment files.
6. For production, host the Node server behind HTTPS and set `HOST=0.0.0.0` only when required by the chosen host. Configure Firebase authorized domains. Review provider billing before enabling cloud storage/hosting; this work does not activate a paid plan.
7. Verify real upload, submission, retry, ownership isolation and rules using a test college account before accepting student documents.

Order submissions validate file ownership, metadata, size and settings on the server, recalculate estimates, and start with `reviewStatus: pending` and no payable quote. Files are untrusted: staff must review/scan them and must not automatically execute or open macros. Add malware scanning and quotas/App Check for production. Uploads are immutable to prevent post-quote substitution. Incomplete uploads can be retried with the same order ID; a retention/cleanup job for abandoned uploads remains to be deployed.

## Shop review and manual payment confirmation

An operator dashboard is implemented at `operator.html`. The student signs in once with a verified college account. Exact emails listed server-side in `PRINT_OPERATOR_EMAILS` additionally receive operator access; student features stay available. Do not add an invented college alias. Add the real verified roll-number email after confirming ownership. The student dashboard shows an Operator dashboard link only to authorized operators.

Operators can download submitted files, confirm a quote after reviewing the documents, confirm cash received, review UPI payment references, and move orders through printing, ready and collected. Student identity and order ownership are checked on the server. Operators cannot review or approve their own orders. Another authorized operator must handle their student orders. The operator preview at `operator.html?preview=1` has only an in-memory example and cannot change real records.

### Manual UPI to the individual recipient (current choice)

Set `PAYMENT_MODE=manual`, `MERCHANT_UPI_REFERENCE=9550963999@fam` and `MERCHANT_UPI_ACCOUNT_NAME=Hanish`. The mode is selected locally, but remains unavailable until `KITSW_ENABLE_ORDERS=true`, the Firebase services are configured, and `PRINT_OPERATOR_EMAILS` contains the actual verified operator email. Gateway keys and webhooks are not required for this manual flow.

1. Student submits documents; an operator confirms the quote.
2. Student opens payment instructions showing the fixed quote, expected recipient, a locally generated UPI QR and an app link. The actual receiver name must be checked inside the UPI app. The app does not claim bank verification of the supplied name.
3. After transferring, the student submits the transaction reference. Status becomes `pending_verification`, never automatically paid. Returning from a payment app does not imply success.
4. The recipient checks the credited transaction in their bank/UPI history. An authorized operator enters the exact received amount, attests to matching receipt, and approves or rejects the current claim.
5. Approval records who confirmed it, when, and the reference, and marks the order paid. Rejection includes a reason and tells the student to contact the recipient before paying again. The student order view refreshes every 30 seconds while open.

Duplicate approved references for the same payee cannot settle different orders. A quote locks once payment instructions are requested. Claims and operator changes are recorded in each order's server-only audit subcollection. Cash cannot be confirmed while an online payment is active. Refunds, partial payments, stale transfers and locked-price corrections require administrator reconciliation; do not make a second payment to bypass a pending status.

This manual flow depends on the recipient actually checking their bank records. It is not automatic bank reconciliation. Only give operator access to people authorized to review the recipient's receipts and student documents. Genuine uploads and orders still require the backend setup above.

## Optional gateway activation later

The supplied reference is `9550963999@fam`, with account-holder name `Hanish` as supplied by the team. The shop display name remains `Tech-Titans-Xerox`. **Neither ownership of this UPI ID nor its eligibility for merchant collections has been verified by a bank/payment provider.** There is deliberately no direct payment deep link or false “UPI verified” indicator. `MERCHANT_UPI_ACCOUNT_NAME` records the expected account holder for onboarding; it does not redirect gateway settlements or verify the account.

A Razorpay integration is included as a replaceable provider adapter. A merchant account and test/live credentials are still needed. Payment-provider onboarding determines the actual receiving merchant/settlement account; supplying a personal UPI ID does not configure it.

1. Complete merchant onboarding with the provider and confirm the receiving account/name. Verify that the provider supports your business and intended UPI apps, including FamApp, through real merchant test coverage. The UI does not promise every UPI app on every device.
2. Configure `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` securely on the server. Start with test credentials. Configure automatic capture and a public HTTPS webhook at `/api/payment-webhook` for `payment.captured`.
3. Enable `KITSW_MERCHANT_VERIFIED=true` only after verification and test approval. This environment switch is an operator attestation, not an automatic UPI verification API.
4. Test successful capture, authorization pending capture, failed/cancelled checkout, duplicate webhooks, wrong signature/amount/currency/order, browser closure, and offline-to-online payment. Only then switch to live keys.

Checkout amounts come from the server-approved quote, not browser estimates. The server stores a provider order, locks the amount, verifies the HMAC signature and fetches the provider payment. Only a matching captured INR payment marks the order paid. Signed webhooks reconcile payment when the browser closes. Browser success callbacks alone cannot mark payment paid. Students enter their UPI PIN only in their UPI app.

If provider order creation times out, the backend intentionally keeps `checkoutState: creating` rather than creating another payable order. Reconcile the provider receipt (the print-order UUID) and record its order mapping before unlocking it. This avoids duplicate charge attempts but currently needs operator handling. Refund/dispute workflows and staff checkout management are not implemented yet.

## Tests and remaining integration checks

Run `npm test`. Unit and DOM tests cover page ranges, pricing, settings, upload errors, preview orders, missing configuration, security boundaries, HMAC verification and captured-payment validation. The tests do not send live payments or upload real documents. Browser visual QA, deployed Firebase Rules tests, real document delivery and provider end-to-end tests still need the connected environments.

## Research references

- Firebase Admin setup: https://firebase.google.com/docs/admin/setup
- Storage rules: https://firebase.google.com/docs/storage/security/rules-conditions
- Razorpay checkout/server verification: https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/
- Webhook verification: https://razorpay.com/docs/webhooks/validate-test/
- Online print delivery to Warangal: https://printster.in/print/states/telangana/warangal — delivery/bulk rates are not verified local college walk-in tariffs. The app uses the team's supplied rates instead.

## Personal-account testing vs provider test mode

`9550963999@fam` / `Hanish` is a team member's individual development account, not the final shop merchant account. Replacing this reference does not configure Razorpay settlement routing.

- **Provider sandbox:** Set `PAYMENT_MODE=test` and configure only `rzp_test_` credentials plus the test webhook secret on the server. Live merchant verification is not required by this app in this mode. Firebase server/storage setup is still required. These transactions move no real money and cannot exercise actual FamApp redirects or transfer funds to the personal ID.
- **Real individual transfer:** Moves real money and requires the recipient to independently confirm receipt. A UPI link, screenshot, entered reference number or returning from a UPI app is not automatic proof of payment. The manual-confirmation flow is implemented as described above; live operation still requires the Firebase backend and operator access configuration.
- **Production:** Set `PAYMENT_MODE=live`, use live keys and complete merchant verification. `off` is the default; missing/mismatched credentials keep checkout disabled.

Test mode uses `testOrders`, `testPaymentOrders` and `testOrderQuotas`, inside the isolated kitswApp database subtree. The UI labels test payments explicitly. Do not fulfill these orders as paid. Use a separate development Firebase project for stronger separation before inviting testers; test uploads still use real cloud storage. Review the same test-provider account and webhook environment together before switching modes.

## Shop dashboard update

Hanish keeps student access and uses operator.html for the shop counter. Active orders, printing, ready-to-collect, payments and completed history have separate filters and larger controls. Handed-over orders leave the active queue, retaining payment/history records. Only paid orders can be handed over; self-approval remains blocked.

An authorized operator can pause or resume new orders. Student dashboards poll availability every 15 seconds; the server checks availability atomically when reserving an upload and when creating an order. Existing orders remain accessible and payable.

Fixed rates confirmed by the team: every offered paper size costs Rs 5 per black-and-white printed side or Rs 10 per colour side. Copies, page range and pages-per-side determine the total; duplex changes sheets, not the price per printed side. Binding is unavailable until a rate is supplied. Manual quote entry is disabled; new orders start accepted with a server-calculated total. Students must accurately enter document page counts.

## Collection codes and checkout

Every new order reserves a date, slot and number atomically with order creation. Slots 1-8 correspond to 09:00-17:00 IST and use order time only, ignoring requested pickup time. Numbers 1-100 are never reused within a slot/date, including after cancellation. A full slot spills to the next hour; after 17:00 uses the next day. Show date + slot + number together. Test-mode counters are separate. Existing active orders can be assigned codes with server/backfill-slots.cjs. The code is a storage/collection reference, not a promised printing completion time.

Successful placement opens payment instructions immediately. The QR and generic upi:// intent support compatible installed apps; device/browser/app support varies, especially for personal payees. Save QR/import and copy-UPI fallbacks remain. No transfer or paid status is triggered by opening the dialog. Cash after QR viewing requires staff to check that no UPI transfer was received.

Student active statuses are Order placed and Ready to collect. Terminal outcomes remain truthful in History. Shop navigation is hidden unless the server confirms the operator role; the API still enforces it independently.

## Automatic page counting (5 October 2026)

PDF, PNG, JPEG, still WebP and classic multipage TIFF are counted locally in a browser worker before checkout. The field is read-only and ranges/copies update the total. Word, Excel, PowerPoint, text, HEIC, animated images and unsupported TIFF variants must be exported to a printable PDF first; their page totals depend on layout or unsupported decoding. Files stay local during counting.

The server independently inspects uploaded bytes in a time- and memory-limited worker, validates image decoding, and records the verified count in the protected upload session. Order creation rejects unverified or mismatched counts and recalculates all prices. There is no silent fallback to one page. Locked/corrupt PDFs are rejected. This is format validation, not malware scanning. Existing accepted orders keep their original totals.

QA covers real generated PDFs and images, multi-page TIFF, encrypted/malformed files, page-count tampering, duplicate order submission, pricing, slots, pause/resume, UPI claims/approvals, cash and handover using isolated test accounts and in-memory storage. Real student credentials and money are never used by these tests.
