# THEESKAPOOO

A KITSW campus printing app by **Tech Titans**. Students upload documents, choose print settings, pay by UPI and collect their prints using a dated slot and number. Authorized operators manage the queue, urgent orders, shop availability and handover from a separate dashboard.

## Run locally

Requires Node.js 22 or later.

1. Run `npm ci`.
2. Copy `.env.example` to `.env` and configure your own Firebase Admin credentials, private Supabase bucket and operator emails. Store the Admin JSON outside this repository.
3. Configure Firebase email/password authentication and the browser settings in `firebase-config.js`.
4. Run `npm start`, then open http://localhost:4174.

See [SETUP.md](SETUP.md), [SUPABASE_SETUP.md](SUPABASE_SETUP.md) and [UX_UPDATES.md](UX_UPDATES.md) for setup and current behavior. `.env.example` disables real orders until backend configuration is complete.

## Payment behavior

The current `self_declared` mode creates orders only after a student ticks the payment checkbox and selects Done. It records **Declared paid**, without recipient approval. This is a temporary student declaration; it does not verify a bank transfer. Merchant gateway integration and production payment testing remain necessary for verified payments.

## Checks and sensitive data

- `npm test` runs automated tests with local fixtures and mocked services.
- `node server/check-repo-secrets.cjs` checks publishable files and Git history for common credentials and configured secret values without printing those values.
- Never commit `.env`, Admin JSON, Supabase secret keys, gateway secrets, private keys, student documents, database exports or server logs.
- Firebase browser configuration is public application identification. It is not an Admin credential; database and storage access remain restricted by server authentication and rules.

This local server is not an always-on deployment. A campus launch needs HTTPS hosting, monitoring, backups and realistic load testing. See the outage notes in `UX_UPDATES.md`.
