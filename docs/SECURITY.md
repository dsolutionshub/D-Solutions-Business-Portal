# Security

How the portal protects client data, and what to do if something goes wrong.

## Who can get in

- **Portal sign-in.** Staff sign in with their work email and a password. Only people an Admin
  invited can sign in, and nobody can sign themselves up. The sign-in
  pages are public; everything else needs a session.
- **Passwords** are never stored. Only a PBKDF2-HMAC-SHA256 hash is kept (random 16-byte salt,
  100,000 iterations by default, the most Workers allow). Policy: at least 10 characters, not a
  common password, not too repetitive. A wrong email and a wrong password get the same answer
  and take the same time, so the sign-in page doesn't reveal who has an account.
- **Lockout:** 5 wrong passwords in a row lock the account for 15 minutes. Sign-in and "forgot
  password" are also rate-limited per IP address, and the edge rule (DEPLOY step 24) limits writes.
- **Sessions:** a random 32-byte token in a `__Host-` cookie (`HttpOnly`, `Secure`,
  `SameSite=Lax`). Only its SHA-256 is stored, so a database copy can't be used to sign in. A
  session ends 12 hours after the last use and at most 7 days after sign-in. Signing out,
  changing your password (other devices), resetting it, and being deactivated all end sessions
  at once.
- **Set / reset links** are single-use and expire (invites 72 hours, resets 1 hour). Only their
  hash is stored. The Email Center history records that a link was sent, never the link.
- **Cross-site requests:** a change (POST/PATCH/DELETE) must come from the app's own pages
  (`Origin` and `Sec-Fetch-Site` checks). With the `SameSite` cookie and JSON-only bodies, this
  blocks CSRF.
- **Cloudflare Access (optional)** can sit in front of the whole site as an extra wall, for
  example to require Google sign-in first. When set up (`ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`), the
  Worker verifies the Access token on requests without a portal session: the RS256 signature
  against the team's public keys, the audience, the issuer and the expiry. The plain
  `Cf-Access-Authenticated-User-Email` header is never trusted on its own.
- **Local development only** (`ENVIRONMENT=development`, set only in `server/.dev.vars`): cookies
  work over plain http, reset links are
  printed instead of emailed, and automated tests may pass the Access email header. Deployed
  environments do none of this.
- **Roles.** What someone may do comes from their role. Admin is built in, has every permission
  and can't be changed. Admins create other roles under Team & Permissions → Role permissions and
  tick what each may do; custom roles can never get the Admin-only permissions (managing the team,
  running the daily job by hand), so nobody can raise their own access. The server resolves the
  role's permissions on every request and enforces them on every route; the app only hides buttons.
  Changing a role's permissions applies immediately.
- Two API paths need no sign-in: `/api/public/*` (invoice and receipt links in client emails,
  which are HMAC-signed, expire after 120 days, and show only that one document) and
  `/api/health` (ok flags, no data).

## How secrets are stored

- Project secrets (registrar, hosting and database passwords, payment and API keys, secret "other
  keys") are encrypted with **AES-256-GCM** in the Worker before they are stored. Each value gets a
  fresh random 12-byte IV and is bound to its project and field (additional authenticated data),
  so a ciphertext can't be moved to another record. D1 holds only ciphertext + IV, with no
  plaintext column.
- The key, `ENCRYPTION_KEY`, is a Cloudflare Worker secret per environment. It isn't in the code,
  the repository, the database or the browser. Without it, a database copy (or a backup) reveals
  no secrets.
- Secrets are **write-only** in forms. Lists, project pages, exports, the sheet download, emails
  and logs never contain them, only "set / not set". Tests check API responses and exports for
  plaintext and ciphertext (`security.api.test.ts`), and CI checks the built app bundle
  (`npm run check:bundle`).
- **Revealing** a value needs the `secrets.reveal` permission (Admin, or a role given it), is limited to 30 a
  minute per person, and is written to the audit log.
- Backups are encrypted again with age, for a key only the Admin holds offline.

## Audit log

The server records who did what, and when, in the `audit_log` table. There is no screen for it
in the portal; read it from the database when you need it (examples below):

- sign-ins, wrong passwords and lockouts, password changes and resets;
- secret reveals and changes;
- invoices issued and voided; payments recorded;
- invites, role changes, deactivations and reactivations;
- settings and dropdown-list changes;
- renewals, emails sent, data exports and daily-job runs started by hand.

Entries are append-only and never contain secret values. To read the latest entries:

```bash
cd server && npx wrangler d1 execute DB --env production --remote --command   "SELECT a.created_at, u.email, a.action, a.entity, a.entity_id FROM audit_log a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.created_at DESC LIMIT 50"
```

Add `WHERE a.action = 'secret.reveal'` (or `auth.login_failed`, `invoice.void`, …) to narrow it.

## Other protections

- Security headers on the app (`client/public/_headers`): strict CSP (scripts only from the app
  itself, fonts from Google Fonts), `X-Frame-Options: DENY`, HSTS, `Referrer-Policy`, and a
  `Permissions-Policy` that turns off camera, microphone and location. API responses carry their
  own strict CSP, `nosniff`, `no-store`, `DENY`. The printable pages allow only their one
  auto-print script, pinned by hash.
- Input limits: JSON bodies up to 256 KB and uploads up to 1.5 MB; every field has a maximum
  length (Zod schemas shared by app and API).
- Rate limits: 120 changes per minute per user in the Worker, plus the edge rule in DEPLOY step 24.
- Errors: users get a generic message with a reference id; details go only to the logs.
- Email bodies are filtered to safe formatting (no scripts, no `javascript:` links) before they
  are stored or sent.
- CSV exports escape cells starting with `=`, `+`, `-` or `@`, so spreadsheets don't run them as
  formulas.

## Incident steps

### A staff member leaves, or a laptop is lost

1. Team & Permissions → ⋯ → **Deactivate** them. This takes effect on their next request.
2. Zero Trust → Access → Applications → Portal → Policies → remove their email. Also _Zero Trust →
   My Team → Users →_ the person → **Revoke session**.
3. If their role could reveal secrets, check the audit log (query above) for recent reveals. Then
   rotate the client credentials that matter (database, payment and hosting passwords) at the
   providers, and update them in the project sheets.

### `ENCRYPTION_KEY` may have leaked

1. Rotate it now: [OPERATIONS.md → Rotating ENCRYPTION_KEY](OPERATIONS.md#rotating-encryption_key).
2. A leaked key plus a database copy would reveal every secret. Rotate the **underlying
   credentials** too (database, payment gateway and hosting passwords) at the providers, starting
   with production stores.
3. Check _Zero Trust → Logs → Access_ and the audit log for unusual activity.

### Brevo or Cloudflare API token leaked

- **Brevo:** _SMTP & API → API keys →_ delete the key and create a new one. Then
  `npx wrangler secret put BREVO_API_KEY --env production`.
- **Cloudflare token:** _My Profile → API Tokens → Roll_ (or delete and recreate with the same
  permissions), then update `CLOUDFLARE_API_TOKEN` in GitHub.

### Suspicious data change

Find who and when in the audit log. Undo with D1 Time Travel (last 7 days) or a backup restore:
see [OPERATIONS.md](OPERATIONS.md).

## Reporting a problem

Report security issues to the Admin directly, not in a shared channel, with the time and the
reference id from any error message.
