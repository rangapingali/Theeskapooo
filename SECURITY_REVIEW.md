# Security and mobile review — 11 October 2026

## Changes

- Content Security Policy restricts scripts to this app and Firebase's SDK; Razorpay is allowed only when gateway mode is enabled. Inline scripts and foreign framing are blocked. Objects are restricted to same-origin/blob URLs to preserve private PDF printing. Browser privacy headers and HTTPS-only HSTS are applied.
- API requests from foreign browser origins are rejected. The payment webhook remains available for its existing signature validation.
- A bounded per-process IP limiter runs before token verification (600 requests/minute). Existing verified-email, account-level throttling, ownership and operator authorization remain in place.
- Uploads have two concurrent request slots and a transactional 100 MB/account/day allowance, in addition to existing file/session limits. The day resets at UTC midnight. Retrying a file does not consume its allowance again. Failed new files consume their reserved allowance to discourage repeated abuse.
- Oversized requests receive HTTP 413. Unexpected server errors no longer expose backend configuration details.
- Mobile screens have larger navigation labels and touch targets, more clearance above bottom navigation, wrapping action buttons, and bounded dialogs. The login form appears before introductory content on small screens.

## Validation

The full automated suite passes (102 tests). Upload quota/retry regression tests also pass. Tests cover authentication, student/operator authorization, payment modes, checkout, page detection, queues, retention and the new protections. A repository/history secret scan is performed before committing.

No interactive browser/device surface was available in this session. Responsive CSS was reviewed, but physical-phone layout, installed-PWA behaviour and real UPI-app switching still need a device check. No real student order or payment was created during testing.

## Remaining limitations

- At the owner's explicit request, self-declared payment remains enabled for the pilot. A checkbox is not bank verification and cannot prevent false payment claims. Use a verified merchant gateway before treating payments as automatically authenticated.
- The production npm audit reports two moderate transitive advisories (uuid/gaxios), with no high or critical advisories. The non-breaking audit-fix dry run did not resolve them. No forced major dependency upgrade was applied.
- Files are checked for format and page validity, not antivirus-scanned. Keep the shop's document software updated and use Protected View; do not enable macros from uploaded documents.
- Limits are per server process, not a distributed DDoS defence. A shared campus network can hit the IP limit. Monitor usage before increasing limits or adding replicas.
- Per-account quotas do not guarantee that Supabase's free storage can hold 2,000 students' files. Collected files are removed immediately; cancelled/abandoned files expire after 24 hours. Active orders keep their documents. Cleanup runs while the server is awake; free-host sleep can delay it.
- No cloud credentials were changed. The Firebase Admin key previously shared in conversation must be revoked and replaced in the provider console; source-code changes cannot revoke it.
- No application can be guaranteed completely secure. Maintain dependency updates, provider access controls and backups of order/payment records.
