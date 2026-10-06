# Student and shop experience

## Current payment flow

`PAYMENT_MODE=self_declared` uses **upload → QR/UPI payment → checkbox → Done → order placed**. Preparing payment creates a private checkout draft, not a shop order or collection slot. Closing checkout keeps the selected files. Done requires explicit student confirmation; the server checks the saved draft, upload ownership and fixed total before atomically creating the order and its collection code. Repeated submissions reuse the same order ID.

The stored status is `declared_paid`, displayed as **Declared paid — student confirmation**. This is a temporary trust-based payment flow, not bank verification. There is no recipient approval, UTR entry or cash choice for new orders in this mode. The shop can print and hand over declared-paid orders. Old unpaid/pending orders can be confirmed by their owner without paying twice. Payment declarations and ready-to-collect transitions can play the supplied audio after sound alerts are enabled.

If saving fails after a transfer, keep checkout open and retry Done; do not transfer again. Drafts expire after 24 hours, and abandoned documents are removed after 48 hours. Contact the shop if a paid checkout has expired or the shop pauses while payment is in progress. A merchant gateway and verified callbacks must replace this declaration flow before relying on automatic bank confirmation. Legacy manual/gateway modes remain separate; switching modes requires testing their own workflows.

The preview pages still demonstrate the older example payment flow and never transfer money. Use a configured local server for the current payment-first workflow.

- Firebase login now uses local persistence. Closing/reopening the browser keeps the account signed in on that browser profile. Explicit sign-out, cleared browser storage, private browsing, account disablement or token revocation can end a session. Passwords are handled by Firebase, not saved by this app.
- Ordinary requests no longer force a Firebase user reload. Shop actions show saving feedback immediately and render the updated order returned by the server. Failed updates retain entered payment fields for retry. Status/cash transactions read and write only that order and its new nested audit records; multi-record payment approvals and slot allocation remain atomic across their records. Existing audit records are retained. Student queries use the `uid` database index to load that student's rows rather than the full collection, with a compatibility fallback until indexes deploy.
- Urgency is optional, defaults off and adds ₹8 **once per order**. The server calculates the fee and includes it in the payment total. The shop sees highlighted urgent orders first. Priority does not promise a completion time or bypass a paused shop.
- PDF/JPEG/PNG/still WebP/TIFF page counts are automatic and checked by the server. Word, PowerPoint, Excel, OpenDocument, RTF, text/CSV, HEIC/HEIF, BMP and GIF are accepted with manual counts. Use the source application's Print Preview with the selected paper size/layout. Manual counts are explicitly labelled, and the operator must confirm checking them before printing. Basic format checking is not office-file rendering, layout conversion or malware scanning. Encrypted/damaged PDFs must be repaired or unlocked; they do not silently fall back to editable counts.
- Slot allocation is based on order time in IST. Orders in the same hour share a slot but get distinct numbers 1–100 per date. A full slot spills to the next slot/day; numbers are not reused. A collection code is not a ready-time guarantee.
- Students can enable sound alerts for ready-to-collect and server-confirmed paid transitions. A pending UPI claim does not trigger payment success. The supplied `Theeskapo.m4a.mp4` has been processed into `notification-voice.mp3`: band filtering, adaptive spectral noise reduction, gentle noise gating, edge silence trimming and volume normalization. The source recording is unchanged. A chime remains a fallback if no custom recording is configured. This is tab-based polling, not background push delivery after the browser is closed. Browsers require a user gesture before sound.

## Temporary outages

`npm start` now runs a small supervisor that restarts a crashed child server. It does not survive shutdown of the computer, terminal or supervisor process. The website begins listening even when the private storage startup check is unavailable; order submission remains disabled until that check succeeds, retried every 30 seconds. `/healthz` reports that initial storage readiness, not full dependency monitoring.

An already open student dashboard preserves selected files/settings in memory, shows unavailable status, and retries on reconnect/focus and periodically. Submitted orders and payment records remain in Firebase; documents remain in the private bucket subject to retention. Closing/reloading the page discards unsubmitted local file selections. A lost response does not imply a failed order/payment: check orders before paying again. Existing creation retries retain the same order ID.

For a campus launch, deploy the Node service to an always-on host with a process manager and HTTPS, keep Firebase/Supabase credentials in that host's secret configuration, configure health monitoring and database backups, and verify outages/load under realistic concurrent usage. Localhost is only reachable on this computer. This update does not purchase hosting or claim 24/7 availability.

## Verification

Run `npm test`. Coverage includes persistent-auth selection, simultaneous slot allocation with conflict retries, scoped transactional updates, server-side priority pricing, manual file counts through the full student/shop flow, fast shop-action rendering, reconnect preservation, and non-repeating ready/paid alerts. Production payments are not simulated or approved by these tests.
