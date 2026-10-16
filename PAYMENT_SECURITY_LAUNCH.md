# Payment security and merchant launch — 15 October 2026

## Current position
This is a security-hardening pass, not a penetration-test certification or a promise of zero fraud. The present self_declared checkbox is deliberately unchanged for testing. It is not payment verification and must not be used as the production proof of payment.

Implemented protections include server-side pricing and upload ownership, authenticated role checks, private document storage, signed gateway callbacks/webhooks, fetching payment state from Razorpay, matching order/amount/currency/capture/refund state, atomic payment receipt ownership and repeat-callback handling. Gateway-mode printing now rejects legacy declarations/manual UPI approvals and unverified paid records. Operator-recorded cash remains a separate trusted-staff workflow. Late captures on closed orders are flagged for reconciliation and do not reopen them. Existing sessions are checked for revocation.

## Required before real merchant payments
1. Owner opens the merchant account in their own business identity, completes provider KYC and confirms their settlement bank account. Keep the personal student UPI ID for testing only.
2. Enable two-factor authentication for the merchant dashboard, Gmail and GitHub/hosting accounts. Use separate staff accounts and least privilege. App-level staff MFA is not implemented by this change; email verification alone is not MFA. Do not share the admin account with shop workers when moving beyond the pilot.
3. Delete/rotate the Firebase service-account key previously pasted in chat, if not already done. Rotate any exposed Supabase/gateway secrets too. Store server secrets only in hosting environment/secret files, never Git/browser code/chat. Confirm deployed database/storage rules deny direct client access to private server records.
4. Configure Razorpay test keys and a distinct webhook secret; validate success, failure, pending capture, callback timeout, webhook duplicates/out-of-order delivery, wrong amount, altered signature, refund and dispute handling. Live/test records must remain separate.
5. Finish and exercise production refund/dispute reconciliation and merchant settlement reporting. Current implementation handles captured payments, not a complete refund/chargeback lifecycle. Keep admin-controlled printing holds and incident response procedures before production.
6. Reconcile old self-declared/manual orders before gateway migration. They deliberately cannot print as verified gateway orders. Never migrate a checkbox payment to verified without matching a merchant/bank record.
7. Only after test sign-off configure PAYMENT_MODE=live, live keys, webhook secret and KITSW_MERCHANT_VERIFIED=true. This flag is a deployment acknowledgement, not bank verification. Do not switch today: the final merchant checkout and post-payment lifecycle still need end-to-end verification.
8. Start with a small supervised real payment and refund. Confirm gross amount, provider fee, tax, net bank settlement and order status. Then pilot a limited number of users.
9. Each evening compare app payment IDs/totals against provider payments, refunds and bank settlements. Investigate mismatches; do not mark unknown payments paid or ask users to pay twice.
10. Monitor webhook failures, uptime, storage retention, unusual order volume and staff access. Schedule backups and restore tests, patch dependencies regularly, and obtain an independent security assessment before a broad rollout. An always-available backend and persistent reconciliation job are important; do not assume a sleeping free host receives events immediately.

## Gateway comparison (standard published pricing; confirm written merchant quote)
Razorpay: generally 2% + 18% GST on the fee for standard domestic gateway transactions. Effective example 2.36%; a Rs50 order costs about Rs1.18, Rs100 about Rs2.36, excluding method-specific additions and rounding. Existing app integration reduces implementation effort. This does not establish it as objectively safer than every competitor.
Cashfree: standard published 1.95% + applicable taxes, about 2.301% using 18% GST. Rs50 about Rs1.15, Rs100 about Rs2.30. Current 0% promotions are conditional; published terms still deduct GST calculated on the standard fee. Do not choose solely on a temporary headline.
At Rs100,000 monthly standard eligible volume, these assumptions give approximately Rs2,360 versus Rs2,301 — only Rs59 difference. Compare support, payment success, refund handling and actual settlement terms as well.

Official sources checked:
- https://razorpay.com/pricing/
- https://www.cashfree.com/payment-gateway-charges/
- https://razorpay.com/docs/webhooks/validate-test/

## What to tell the owner
"A screenshot or payment checkbox can be faked. With the merchant gateway, our server checks the exact order and amount against the provider before allowing printing. Payments settle to your merchant bank account, with transaction records for reconciliation. We will test failures and refunds, show you the fee on a sample order, and start with a small pilot. This reduces fraud and checking work, but does not eliminate all risk."

Ask each provider for a written quote covering standard UPI, RuPay credit-on-UPI, cards, GST, setup/annual fees, normal/instant settlements, refund fee treatment, dispute costs, promotional expiry and support escalation. Keep the owner in control of settlement-account changes and refunds.

## Dependency audit result for this pass
The production npm audit reported 2 moderate advisories (gaxios / its uuid dependency), with no high or critical production advisories. A compatible automatic fix did not resolve them; no forced breaking Firebase CLI downgrade or untested major override was applied. The all-dependency scan additionally flags development-tool dependencies (including high-severity braces/chokidar paths). Deploy with npm ci --omit=dev, and resolve/test dependency upgrades before the production security sign-off. This report is not a clean-audit claim.
