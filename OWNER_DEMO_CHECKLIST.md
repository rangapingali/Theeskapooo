# Owner demonstration - 26 October 2026

## Before presenting

1. Confirm Render has deployed the latest GitHub main commit. Open the website a few minutes before the demonstration; the first request during this review took about 23 seconds, then later requests were quick.
2. Refresh the page after deployment. Sign in to a verified student account in one browser/phone, and your staff account in a separate browser profile/phone. Student and operator accounts must be different for printing.
3. In the shop dashboard, confirm "Open - accepting orders". Have a small PDF and a PNG ready. Use non-sensitive sample documents.
4. Keep the current PAYMENT_MODE=self_declared configuration. No merchant gateway or recipient approval is needed for the current demonstration flow. A payment checkbox records a student declaration, not bank verification.

## Demonstrate the workflow

1. Student: upload a PDF or PNG, check detected pages, choose copies/colour/sides/range, and review the total.
2. Online option: Place order opens the QR screen. After the actual payment, tick the confirmation and press Done. Check that the order and its collection code appear in My orders. Do not claim a bank-verified payment when showing this test workflow.
3. Operator: Refresh; find the same order by slot/number or student/file name. Show print settings and selected shop printer. No recipient approval step is required in self-declared mode.
4. On an already configured shop phone, use the Android helper. If printer capability/connection has not been verified, use Prepared PDF / manual printing instead. Do not promise automatic physical printing before checking the actual shop equipment.
5. Operator: mark Printing, then Ready after checking the paper. Student: refresh My orders and see Ready to collect.
6. Mark handed over only after collection: collected document files are deleted. Use a disposable demonstration document for this step.
7. Show the earnings page and admin overview. These are recorded amounts, not gateway-reconciled bank settlements.
8. Optional offline demonstration: choose a payment appointment, place the order, find its offline number in the shop queue, record cash when the student is present, then print/ready/collect.
9. Briefly pause new orders; confirm students see the busy message. Resume accepting orders afterwards.

## If a connection is slow

- Keep the page open. Use Check connection / Refresh, or Retry connection on the staff page.
- Do not pay again or create another order just because a response was delayed. Check My orders first; retry the existing checkout if necessary.
- Do not resend a print whose result is uncertain. Inspect the printer queue and physical output.
- Alerts work while the app is running. Closed-app push is not implemented.

## What was checked

Local automated regression and server-flow tests cover login handling, uploads, page counts, fixed prices, self-declared checkout, duplicate submission, offline IDs, queue/status changes, access checks, retention and PDF/PNG preparation. Public deployment checks confirmed service availability, enabled self-declared ordering, accessible staff/shop/admin pages and denied unauthenticated operator access.

No connected browser was available for visual phone inspection. Actual shop printer output, real UPI transfer, live authenticated orders and email delivery still require your rehearsal. The demonstration is not a claim of production security certification or zero possible errors.
