> Activation verified 4 October 2026: Supabase private bucket created; real upload, immutable retry, version-checked download and anonymous access denial passed. Test file deleted. Local server orders and manual payments enabled. Firebase Realtime Database and verified operator checks passed. Student end-to-end payment approval still needs user testing.

# Private document storage

Project URL: https://iopzmdjsfgnmbqckkjcb.supabase.co

Firebase still handles verified college login, order records and manual payment approvals. Supabase handles document files only. Firebase Storage and Blaze are no longer required by this implementation.

1. Open the Supabase project, then **Project Settings > API Keys**.
2. Copy a **secret server key** (or legacy `service_role` key). Save it only in the ignored local `.env` as `SUPABASE_SECRET_KEY=...`. Do not paste it into chat or frontend files. A publishable/anon key cannot perform this server setup.
3. `SUPABASE_URL` is already configured. Run `npm run storage:setup` to create the private `print-documents` bucket with a 25 MB object limit. Existing unsafe bucket settings fail validation instead of silently changing access.
4. Do not add public, anon or authenticated upload/download policies for this bucket. Firebase identities are checked by the Node server; Supabase's server key is used only after authorization.
5. Run `npm run backend:check`. Before activation, verify a real upload, retry, private operator download and anonymous download denial. Then enable `KITSW_ENABLE_ORDERS=true` and restart `npm start`.

Uploads travel through the Node server with Firebase ID tokens, are immutable, and are limited to 10 documents/100 MB per order and 30 upload sessions per user per day. Existing API rate limits also apply. Operator downloads check the stored object version.

Automatic cleanup runs on startup and hourly while the server is running: files become eligible 24 hours after collection/cancellation, or 48 hours after an abandoned upload session begins. Order and payment records remain. Failed deletes are retried. Run `npm run storage:cleanup` from a reliable scheduler when hosted; an offline local computer cannot perform deletion. Actual deletion occurs on the first successful cleanup after eligibility.

Free storage and transfer quotas are shared by all students. Per-user limits are abuse controls, not a guarantee that the free quota can accommodate 2,000 users. Monitor the Supabase dashboard during a small pilot. Malware scanning and capacity testing remain prerequisites for a campus-wide rollout.
