# Workflow update — 11 October 2026

Checkout now has Documents (including trending prints), Print settings and payment choice, and Payment steps. Moving between steps preserves the in-memory files, settings, notes and choice. Closing or reloading the browser still clears unsent files; the existing leave-page warning remains.

My orders counts unseen order/payment changes, scoped to the signed-in account on this browser. Viewing the orders page clears the badge. Operator cards highlight unseen active orders until acknowledged, downloaded, opened for printing, or acted upon.

Paid priority orders precede normal paid orders; payment receipt time breaks ties, with order ID as the stable final tie-breaker. Unpaid counter visits appear separately and cannot start printing. Hourly collection codes identify documents; passing the hour no longer hides unfinished orders.

Refresh buttons show a pending state, prevent duplicate requests and report success or failure. Handover commits and responds before file deletion completes; immediate deletion starts in the background and scheduled cleanup retries failures. A deletion failure no longer reports an already-saved handover as a failed status update.

The uploaded 11 October voice recording replaces notification-voice.mp3 (about 1.4 seconds, normalized volume). The config includes a new audio version so old cached audio is not reused.

Browser notifications are opt-in and work when the running app observes an update. This is not closed-app push: suspended/background/closed pages may not receive updates until reopened. No push-provider credentials or OS settings were changed. PDF and common images have Open & print, using an authenticated private fetch and a browser preview; there is no silent printing or direct integration with proprietary printer software. Office documents use Download.

## Storage retention

- Collected: immediately request deletion after successful handover. Downloads are denied after handover even if deletion is retrying.
- Cancelled: delete files after 24 hours.
- Unfinished uploads: expire after 24 hours from session creation. Checkout/upload/order validation uses the same limit; the payment QR shows its deadline.
- Active paid/unpaid orders: retain documents until collection or cancellation. Unpaid offline appointment expiry cancels the order using the existing one-hour grace policy, then cancellation retention applies.
- Order/payment records remain. Missing or inconsistent order records are retained for manual investigation, not automatically destroyed.
- Cleanup runs on startup and every 15 minutes while the server is running. Each failed removal retries independently; a failed file/session does not prevent cleanup of other sessions. An upload finishing after its session was deleted is removed rather than orphaned.

Supabase Free includes 1 GB file storage: https://supabase.com/docs/guides/storage/pricing
Storage egress has separate cached/uncached allowances: https://supabase.com/docs/guides/storage/serving/bandwidth
Render Free sleeps after 15 idle minutes: https://render.com/docs/free

This policy reduces storage use but cannot guarantee enough free capacity for 2,000 students. At an average 5 MB/order, 200 simultaneous uncollected orders approach 1 GB before overhead; deletion also does not refund download bandwidth. Monitor Supabase usage and pause new orders before capacity is exhausted; aim for an 80% warning threshold. There is currently no automatic organization-wide capacity monitor. Keep the private bucket dedicated to print documents, and plan paid capacity or another storage host for exam peaks. Never delete active paid work simply to meet a quota.

A sleeping/free server cannot run cleanup at an exact deadline. It retries at wake-up. For strict deletion timing, an external scheduled invocation of the existing cleanup command on a trusted server is needed; do not expose service credentials or a public unauthenticated cleanup endpoint.

## Validation

Final local run: 97 tests passed, 0 failed. Repository audit scanned 322 text files/blobs with 0 possible secret exposures.

Regression tests cover step state, unread updates, priority ordering, new-card acknowledgement, refresh feedback, notification opt-in, authenticated print opening, retention boundaries, independent removal failures, and a handover response while storage deletion is deliberately stalled. Existing payment ownership, immutable totals, concurrent slot allocation, file validation and authentication checks remain in the full suite.

No browser surface was available for a real-device visual review. Before campus rollout, check the installed PWA on Android/iOS and the shop printer dialog. Changes have not been pushed or deployed.
