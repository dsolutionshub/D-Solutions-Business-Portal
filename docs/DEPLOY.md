# Deploying the portal

The first deployment, step by step. Do the steps **in order**.

| Part     | Runs on               | What                                                  |
| -------- | --------------------- | ----------------------------------------------------- |
| Database | Cloudflare **D1**     | `dsol-portal-prod` (all data, including client logos) |
| Backend  | Cloudflare **Worker** | the API, `dsol-portal-api.<you>.workers.dev`          |
| Frontend | **Netlify**           | the app, `https://<site-name>.netlify.app`            |
| Email    | **Brevo**             | invites, password resets, invoices, reminders         |

Netlify forwards every `/api/*` request to the Worker (`netlify.toml`), so people only ever open the
Netlify address. Sign-in cookies, invoice links in emails and the health check all go through it.

- **🖱️** = you click something in a dashboard (Cloudflare, Netlify, Brevo, GitHub).
- **⌨️** = you run a command in the repository folder (`D:\The_D_Solutions\Business Portal\D-Solutions-Business-Portal`).

Time: about an hour. Cost: ₹0 (all free plans).

> Dashboard menus move around now and then. If a label doesn't match exactly, look for the nearest
> equivalent. The values you enter are what matter.

---

## Part A — Cloudflare: database and API

1. 🖱️ **Cloudflare account.** Sign up at <https://dash.cloudflare.com>. Turn on two-factor
   authentication: profile icon → _My Profile_ → _Authentication_.
2. **Your workers.dev subdomain: nothing to do now.** New accounts may not have one yet. When you
   deploy the API (step 12), Cloudflare assigns one or the command asks you to pick it, and prints
   the API address `https://dsol-portal-api.<subdomain>.workers.dev`. (Once it exists, it shows under
   _Compute (Workers) → Workers & Pages_ → _Account details_ → **Subdomain** on the right.)
3. ⌨️ **Log in from your computer:**
   ```bash
   npx wrangler login      # a browser opens: allow access
   npx wrangler whoami     # note the Account ID it prints
   ```
4. **Workers plan: Free** (already configured). Each sign-in hashes the password; the free plan
   allows 10 ms of CPU per request, so `server/wrangler.toml` sets `PBKDF2_ITERATIONS = "20000"`
   (about 4 ms). If you move to Workers Paid (US$5/month) later, delete that line: passwords are
   re-hashed with 100,000 rounds at each person's next sign-in.
   - No card is needed: the portal doesn't use R2. Client logos are stored in the database and
     backups are kept by GitHub.
5. ⌨️ **Create the database** (done ✔ — `dsol-portal-prod`, its id is already in `wrangler.toml`):
   ```bash
   npm run setup:prod
   ```
   This creates the D1 database `dsol-portal-prod` and prints a `database_id` to paste into
   `server/wrangler.toml` under `[[env.production.d1_databases]]` → `database_id`.

## Part B — Netlify: reserve the app's address

6. 🖱️ **Netlify account** at <https://app.netlify.com> → sign up **with GitHub**.
7. 🖱️ **Create the site:** _Add new site → Import an existing project → GitHub_ → allow access to
   `dsolutionshub/D-Solutions-Business-Portal` → pick it.
   - Branch to deploy: `main`. Leave build command / publish directory **empty**: Netlify reads them
     from `netlify.toml` (build `npm run build`, publish `client/dist`, Node 22).
   - Click **Deploy**. The first build takes 2–3 minutes. The app opens, but signing in fails until
     Part D is done. That's expected.
8. 🖱️ **Name the site:** _Site configuration → General → Site details → Change site name_ →
   e.g. `dsol-portal`. Your address is now `https://dsol-portal.netlify.app`. Note it — this is
   the **app address** used everywhere below.
   - Also: _Site configuration → Build & deploy → Deploy Previews_ → **Don't deploy pull
     requests** (previews would talk to the production API).

## Part C — Email (Brevo)

9. 🖱️ **Brevo account** at <https://www.brevo.com> (free plan: 300 emails a day).
   - **Sender.** _Senders, Domains & Dedicated IPs → Senders → Add a sender_: name `D Solutions`,
     email = an address you can receive mail at (e.g. your company mailbox). Brevo emails it a
     confirmation link; click it.
   - **Recommended if you control a company domain** (e.g. `yourcompany.com`): _Domains → Add a
     domain_ and add the DNS records Brevo shows (`brevo-code` TXT, DKIM, DMARC) at whoever hosts
     that domain's DNS. Then send from `no-reply@yourcompany.com`. Without this, invoice and reset
     emails are more likely to land in spam. Free email addresses (Gmail, Outlook) can't be
     authenticated and are often rejected; use a company address.
   - _SMTP & API → API keys → Generate a new API key_ → name `portal` → copy it (shown once). Keep
     it in your password manager.

## Part D — Configure and deploy the API

10. ⌨️ **Fill in `server/wrangler.toml`** under `[env.production.vars]`:
    - `APP_URL = "https://dsol-portal.netlify.app"` (your app address from step 8, no trailing `/`).
    - `EMAIL_FROM_ADDRESS = "…"`: the Brevo sender from step 9.
11. ⌨️ **Secrets** (stored in Cloudflare, never in the repository):
    ```bash
    npm run gen:key        # prints a new encryption key — save it in your password manager as
                           # "Portal ENCRYPTION_KEY (production)". Lose it = encrypted secrets are gone.
    cd server
    npx wrangler secret put ENCRYPTION_KEY --env production   # paste that key
    npx wrangler secret put BREVO_API_KEY  --env production   # paste the Brevo API key
    cd ..
    ```
12. ⌨️ **Deploy the database and the API:**
    ```bash
    npm run deploy:prod
    ```
    This applies all migrations to D1, then deploys the Worker and prints its address,
    `https://dsol-portal-api.<subdomain>.workers.dev`. Check it: open
    `https://dsol-portal-api.<subdomain>.workers.dev/api/health` → `{"ok":true,…}`.
13. ⌨️ **Point Netlify at the API:** in `netlify.toml`, replace
    `https://dsol-portal-api.REPLACE.workers.dev` with your Worker address from step 12. (Commit and
    push happens in step 17.)

## Part E — GitHub: automatic deploys

14. 🖱️ **Cloudflare API token for GitHub.** Cloudflare → profile icon → _My Profile → API Tokens →
    Create Token → Create Custom Token_:
    - Name: `GitHub deploy (portal)`.
    - Permissions, all **Account** scope:
      | Permission       | Access |
      | ---------------- | ------ |
      | Workers Scripts  | Edit   |
      | D1               | Edit   |
      | Account Settings | Read   |
    - Account resources: _Include → your account_. Create, and copy the token (shown once).
15. 🖱️ **GitHub repository settings** (`github.com/dsolutionshub/D-Solutions-Business-Portal`):
    - _Settings → Environments → New environment_ → **`production`**. Optionally add yourself as
      _Required reviewer_ so each production deploy waits for your click.
    - _Settings → Secrets and variables → Actions → New repository secret_:
      `CLOUDFLARE_API_TOKEN` (step 14) and `CLOUDFLARE_ACCOUNT_ID` (step 3).
    - Same page, _Variables_ tab → _New repository variable_: `HEALTH_URL` =
      `https://dsol-portal.netlify.app/api/health` (checked every 6 hours; a failure emails you).
16. ⌨️ **Backup key** (weekly encrypted backups of the database):
    ```bash
    npm run backup:keygen -- --out D:\safe\dsol-backup-key.txt    # a folder OUTSIDE the repository
    ```
    Keep that private key file offline (password manager attachment + a USB stick). **Without it,
    backups can't be restored.** The command writes the public half to `backup/age-recipient.txt`.
17. ⌨️ **Commit and push** `server/wrangler.toml`, `netlify.toml` and `backup/age-recipient.txt`:
    ```bash
    git add server/wrangler.toml netlify.toml backup/age-recipient.txt
    git commit -m "Configure production"
    git push
    ```
    GitHub runs the tests, migrations and API deploy (_Actions_ tab → **Deploy** → green ✓), and
    Netlify rebuilds the app with the API forwarding (_Deploys_ → **Published**). From now on every
    push to `main` deploys both.

## Part F — First sign-in and checks

18. ⌨️ **First run** (empty database → company settings, dropdown lists, you as **Admin**):
    ```bash
    npm run first-run -- --env production --owner you@yourcompany.com --name "Your Name" --company "D Solutions"
    ```
    It prints a one-time link (valid 72 hours). Open it and **choose your password** (use a password
    manager). Running it again prints a fresh link as long as no password is set yet.
19. ✅ **Check production** at `https://dsol-portal.netlify.app`:
    - You land on the sign-in page. Sign in → dashboard, as Admin.
    - `https://dsol-portal.netlify.app/api/health` shows `{"ok":true,…}` without signing in.
    - In a private window, `https://dsol-portal.netlify.app/api/clients` must **not** return data (401).
    - Account menu (top right) → **Sign out** returns to the sign-in page.
    - **Settings → Company & invoicing:** company name, GSTIN, address, bank, UPI, **invoice prefix**
      and **next invoice number** (continue from your last paper invoice).
    - **Team & Permissions → Invite user** with your own second email: the invite email must arrive
      (check Email Center if not).
    - Add a test client and project and reveal a secret. Then archive the client and use
      _Delete permanently_. (Try invoices on a real client: a client with any invoice, even a void
      one, can't be deleted — invoices are kept as financial records.)
    - **Settings → Data → Run now** once: it should report 0 problems.
    - GitHub → _Actions → Backup → Run workflow_ once: it must succeed and show an artifact.
    - The restore drill in [OPERATIONS.md](OPERATIONS.md#restore-drill-do-this-once-before-go-live-then-twice-a-year).

Done. Share `https://dsol-portal.netlify.app` with the team and invite them (below).

---

## Adding a team member

1. As an Admin: _Team & Permissions → Invite user_: name, work email, role (create roles first
   under _Role permissions_ if Admin is too much).
2. They get an email, "Set your Business Portal password", with a link valid for 72 hours. They
   choose a password and sign in at `https://dsol-portal.netlify.app/login`. They show as _Invited_
   until their first sign-in.
3. Link expired, or the email didn't arrive (check Email Center for errors)? _Team & Permissions →
   ⋯ → Email a password link_ sends a fresh one.

**Forgotten password:** _Forgot password?_ on the sign-in page (a link valid for 1 hour).

**Removing someone:** _Team & Permissions → ⋯ → Deactivate_. All their sessions end at once and
they can no longer sign in. Their history is kept.

## Later: your own domain

When you have a domain (e.g. `portal.yourcompany.com`):

1. 🖱️ Netlify → _Domain management → Add a domain_ → follow the DNS instructions. Netlify issues
   the HTTPS certificate.
2. ⌨️ `server/wrangler.toml`: `APP_URL = "https://portal.yourcompany.com"`; commit and push.
3. 🖱️ GitHub variable `HEALTH_URL` → the new address. Old `netlify.app` links keep working, but
   emails will now link to the new domain.

## Notes

- **Why `workers_dev = true`:** the API has a public `*.workers.dev` address so Netlify can forward
  to it. Everything except `/api/health` (ok flags only) and the signed, expiring `/api/public`
  invoice links needs a sign-in, and changes are only accepted from the app's own address
  (`APP_URL`).
- **Optional extra login wall:** Cloudflare Access (Zero Trust) can sit in front later; see
  `ACCESS_TEAM_DOMAIN` / `ACCESS_AUD` in `server/wrangler.toml` and [SECURITY.md](SECURITY.md).
- **Staging:** not set up. `[env.staging]` in `wrangler.toml` is ready if you want a test copy
  later (it needs its own Netlify site and the `staging` branch added back to the deploy workflow).
