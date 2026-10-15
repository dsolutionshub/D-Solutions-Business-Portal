# Deploying the portal

This is the first deployment, step by step. Do the steps **in order**. **Staging** comes first, so
you can try everything (including a restore drill) before production holds real data.

- **🖱️** = you click something in a dashboard (Cloudflare, Brevo, GitHub).
- **⌨️** = you run a command in the repository folder.
- Replace `example.com` with your domain everywhere. The examples use `app.example.com` for
  production and `staging.example.com` for staging.

Time needed: about 1½ hours the first time. Cost: ₹0. Everything runs on free plans.

> Dashboard menus move around now and then. If a label below doesn't match exactly, look for the
> nearest equivalent. The values you enter are what matter.

---

## Part A — Accounts and domain (once)

1. 🖱️ **Cloudflare account.** Sign up at <https://dash.cloudflare.com>. Turn on two-factor
   authentication: profile icon → _My Profile_ → _Authentication_.
2. 🖱️ **Put your domain on Cloudflare.** _Add a site_ → enter `example.com` → _Free_ plan →
   change the nameservers at your registrar to the two that Cloudflare shows. Wait until the site
   shows **Active** (minutes to a few hours). The portal needs this. Without a custom domain, see
   [Fallback](#fallback-no-custom-domain-yet) at the end.
3. 🖱️ **SSL mode.** In the domain: _SSL/TLS_ → _Overview_ → **Full (strict)**. Under _SSL/TLS_ →
   _Edge Certificates_, turn on **Always Use HTTPS**.
4. ⌨️ **Log in from your computer:** `npx wrangler login`. A browser opens; allow access. Check
   with `npx wrangler whoami`, and note the **Account ID** it prints.

## Part B — Staging

5. ⌨️ **Fill in the staging addresses** in `server/wrangler.toml` under `[env.staging]`:
   - `routes`: `pattern = "staging.example.com/api/*"`, `zone_name = "example.com"`.
   - `APP_URL = "https://staging.example.com"`.
   - `EMAIL_FROM_ADDRESS`: the sender you will verify in Brevo, e.g. `no-reply@example.com`.
6. ⌨️ **Create the staging resources:** `npm run setup:staging`. This creates the D1 database
   `dsol-portal-staging`, the R2 bucket `dsol-portal-files-staging` and the Pages project
   `dsol-portal-staging`, and prints a `database_id`. Paste it into `[[env.staging.d1_databases]]`.
7. **How people sign in.** The portal has its own sign-in (work email + password, invite emails,
   "forgot password"), so there is nothing to set up for it. **Cloudflare Access is optional**: an
   extra login wall in front of everything, for example to also require a Google sign-in. Without
   it, set `ACCESS_TEAM_DOMAIN = ""` and `ACCESS_AUD = ""` in `wrangler.toml` and **skip to step 10**.
   To use it, do steps 7a, 8 and 9.

   7a. 🖱️ **(Access only) Cloudflare Access: team and login methods.** Open _Zero Trust_ (left menu of the
   Cloudflare dashboard). The first time, pick a **team name** and the **Free** plan (up to 50 users).
   - Find the **team domain**, `<team>.cloudflareaccess.com`, under _Settings → Custom Pages_ (or
     _Settings → Team name and domain_). Put it in `ACCESS_TEAM_DOMAIN` in `[env.staging.vars]`
     **and** `[env.production.vars]`.
   - _Settings → Authentication → Login methods_: **One-time PIN** is on by default (a code sent by
     email). To also allow "Sign in with Google", choose _Add new → Google_ and follow the on-screen
     steps (they need a Google OAuth client ID and secret).

8. 🖱️ **(Access only) Access application for staging.** _Zero Trust → Access → Applications → Add an
   application → Self-hosted_:
   - Application name: `Portal (staging)`. Session duration: `24 hours`.
   - Application domain: `staging.example.com`. Leave the path **empty**, so the whole site
     (app + `/api`) is protected.
   - Policy: name `Staff`, action **Allow**, _Include → Emails →_ your email (and anyone testing
     staging). The sign-in pages `/login`, `/forgot-password`, `/reset-password` (and `/`, which opens sign-in) then sit
     behind Access too. That's fine: staff pass Access first, then sign in to the portal.
   - Login methods: One-time PIN (+ Google if you added it).
   - Save. Then open the application → _Overview_ (or _Basic information_) and copy the
     **Application Audience (AUD) Tag** into `ACCESS_AUD` under `[env.staging.vars]`.
9. 🖱️ **(Access only) Two pages that must skip Access** (on the same screen, add two more Self-hosted
   applications). Access always applies the most specific path:
   - `Portal public links (staging)`: domain `staging.example.com`, path `api/public`. Policy:
     action **Bypass**, include **Everyone**. Clients open invoice and receipt links from emails
     here, without signing in. The links are signed and expire, and nothing else lives under this path.
   - `Portal health (staging)`: domain `staging.example.com`, path `api/health`, action
     **Bypass**, include **Everyone**. It returns only "ok" flags, no data.
10. ⌨️ **Staging secrets.** Make a new key with `npm run gen:key` and store it in your password
    manager as "Portal ENCRYPTION_KEY (staging)". Then:
    ```bash
    cd server
    npx wrangler secret put ENCRYPTION_KEY --env staging   # paste the key
    npx wrangler secret put BREVO_API_KEY  --env staging   # paste the Brevo key (step 15); any text for now
    cd ..
    ```
11. ⌨️ **Deploy staging:** `npm run deploy:staging`. This applies the migrations, deploys the
    Worker (with its route) and the app (Pages).
12. 🖱️ **Custom domain for the staging app.** _Workers & Pages → dsol-portal-staging → Custom
    domains → Set up a custom domain →_ `staging.example.com`. Cloudflare creates the DNS record.
    Wait for **Active**.
13. ⌨️ **First run** (empty database → settings, dropdown lists, you as Admin):
    ```bash
    npm run first-run -- --env staging --owner you@example.com --name "Your Name" --company "D Solutions"
    ```
    It prints a one-time link (valid 72 hours). Open it and **choose your password**. Running it
    again prints a fresh link as long as no password is set yet.
14. ✅ **Check staging:**
    - Open `https://staging.example.com`: the intro page. **Sign in** with your email and the
      password from step 13 (with Access: pass the one-time PIN first). You land on the dashboard as Admin.
    - `https://staging.example.com/api/health` shows `{"ok":true,…}` without signing in.
    - In a private window, `https://staging.example.com/api/clients` must **not** return data (401).
    - Account menu (top right) → **Sign out** takes you back to the sign-in page.
    - Settings → Company & invoicing: fill in your company details.
    - Add a test client and project, reveal a secret, create and issue an invoice.

## Part C — Email (Brevo)

15. 🖱️ **Brevo account** at <https://www.brevo.com> (free plan: 300 emails a day).
    - _Settings → Senders, Domains & Dedicated IPs → Domains → Add a domain →_ `example.com`.
      Brevo shows DNS records: a `brevo-code` TXT, **DKIM** and **DMARC**, and usually an SPF
      include. Add each one **exactly as shown** in Cloudflare → your domain → _DNS → Records_.
      Brevo can do this automatically when the domain is on Cloudflare. If you already have an SPF
      (`v=spf1 …`) record, add Brevo's include to it instead of creating a second one. A domain
      must have only one SPF record.
    - Click _Authenticate_ / _Verify_ until the domain shows as authenticated (DNS can take an hour).
    - _Senders → Add a sender_: `no-reply@example.com` (the `EMAIL_FROM_ADDRESS`), name
      `D Solutions`.
    - _SMTP & API → API keys → Generate a new API key_. Name it `portal`. Copy it (shown once).
16. ⌨️ **Brevo key for staging:** `cd server && npx wrangler secret put BREVO_API_KEY --env staging`.
    Then in the staging portal, compose an email to yourself to test.

## Part D — GitHub (automatic tests and deploys)

17. 🖱️ **Cloudflare API token for GitHub.** Cloudflare → profile icon → _My Profile → API Tokens →
    Create Token → Create Custom Token_:
    - Name: `GitHub deploy (portal)`.
    - Permissions (the minimum this project needs):
      | Scope   | Permission         | Access |
      | ------- | ------------------ | ------ |
      | Account | Workers Scripts    | Edit   |
      | Account | D1                 | Edit   |
      | Account | Cloudflare Pages   | Edit   |
      | Account | Workers R2 Storage | Edit   |
      | Account | Account Settings   | Read   |
      | Zone    | Workers Routes     | Edit   |
    - Account resources: _Include → your account_. Zone resources: _Include → Specific zone →
      example.com_.
    - Optional: _Client IP Address Filtering_ is not practical for GitHub runners, so leave it empty.
      Set a TTL (expiry) if you want to rotate it yearly.
    - Create, then copy the token (shown once).
18. 🖱️ **GitHub repository settings:**
    - _Settings → Environments_: create **`production`** and **`staging`**. On `production`, you
      can add yourself as a _Required reviewer_, so every production deploy waits for your click.
    - _Settings → Secrets and variables → Actions → New repository secret_:
      `CLOUDFLARE_API_TOKEN` (the token from step 17) and `CLOUDFLARE_ACCOUNT_ID` (from step 4).
    - Same page, _Variables_ tab → _New repository variable_: `HEALTH_URL` =
      `https://app.example.com/api/health` (used by the 6-hourly health check).
    - _Settings → Branches_: add a protection rule for `main` that requires the **CI** check to pass.
19. ⌨️ **Backup key** (needed before the first production backup):
    ```bash
    npm run backup:keygen -- --out D:\safe\dsol-backup-key.txt   # any folder OUTSIDE the repository
    ```
    Keep the private key file offline: a password manager attachment, plus a USB stick in a safe.
    **Without it, backups can't be restored.** Commit `backup/age-recipient.txt`, which holds the
    public key.
20. ⌨️ **Push:** commit everything and push to a `staging` branch. GitHub runs CI, then deploys to
    staging. From now on, a push to `staging` deploys staging and a push to `main` deploys
    production.

## Part E — Production

21. ⌨️ Fill in `[env.production]` in `server/wrangler.toml`: `routes` (`app.example.com/api/*`),
    `APP_URL`, `EMAIL_FROM_ADDRESS`. Then run `npm run setup:prod` and paste the `database_id`.
    This also creates the private backup bucket `dsol-portal-backups`.
22. 🖱️ **(Access only) Access application for production:** repeat steps 8 and 9 with `app.example.com` (names
    `Portal`, `Portal public links`, `Portal health`). In the _Staff_ policy, list **every staff
    email**. Copy the production **AUD tag** into `ACCESS_AUD` under `[env.production.vars]`.
23. ⌨️ **Production secrets.** Make a **new** key with `npm run gen:key`; don't reuse staging's.
    Store it in your password manager as "Portal ENCRYPTION_KEY (production)". Without it, the
    encrypted secrets can't be read.
    ```bash
    cd server
    npx wrangler secret put ENCRYPTION_KEY --env production
    npx wrangler secret put BREVO_API_KEY  --env production
    cd ..
    ```
    **Workers plan and sign-in.** Each sign-in hashes the password with PBKDF2 (100,000 rounds),
    which takes about 20 ms of CPU. The free Workers plan allows 10 ms per request, so sign-ins may
    fail there with "Worker exceeded CPU time limit". Choose one:
    - **Workers Paid (US$5/month), recommended:** _Workers & Pages → Plans_. Nothing else changes.
    - **Stay free:** add `PBKDF2_ITERATIONS = "20000"` under `[env.production.vars]` (and
      staging). Sign-in then fits the free limit, but stolen password hashes are about 5× quicker
      to attack. Lockout, rate limits and Access still apply. Passwords are re-hashed with the new
      setting the next time each person signs in.
24. 🖱️ **Edge rate limit** (one rule is free): Cloudflare → your domain → _Security → WAF → Rate
    limiting rules → Create rule_:
    - Name: `Portal API writes`.
    - If: _URI Path_ starts with `/api/` **and** _Request Method_ is not `GET`.
    - Rate: `100` requests per `10 seconds`, counted per IP. Action: **Block** for `10 seconds`.
      The Worker also limits each user to 120 changes a minute. This rule stops anything heavier
      before it reaches the Worker.
25. ⌨️ **Merge to `main` and push.** GitHub runs CI, then deploys production in the order
    migrations → Worker → app. Or deploy by hand with `npm run deploy:prod`.
26. 🖱️ **Custom domain for the app:** _Workers & Pages → dsol-portal → Custom domains →_
    `app.example.com`. Wait for **Active**.
27. ⌨️ **First run** of the empty production database:
    ```bash
    npm run first-run -- --env production --owner you@example.com --name "Your Name" --company "D Solutions"
    ```
    Open the printed link and choose your production password (use a password manager).
28. ✅ **Check production**, as in step 14, at `https://app.example.com`. Then:
    - Settings → Company & invoicing: company details, GSTIN, bank, UPI, **invoice prefix** and
      **next invoice number** (continue from your last paper invoice).
    - Settings → Data → **Run now** once. It should report 0 problems.
    - GitHub → _Actions → Backup → Run workflow_ once. It must succeed and show an artifact.
    - The restore drill in [OPERATIONS.md](OPERATIONS.md#restore-drill-do-this-once-before-go-live).

---

## Adding a team member

1. As the Admin: _Team & Permissions → Invite user_: name, work email, role.
2. They get an email, "Set your Business Portal password", with a link valid for 72 hours. They
   choose a password and sign in at `https://app.example.com/login`. They show as _Invited_ until
   their first sign-in.
3. Link expired, or the email didn't arrive (check Email Center for errors)? _Team & Permissions →
   ⋯ → Email a password link_ sends a fresh one.
4. **Only if you use Cloudflare Access:** also add their email to the _Staff_ policy (_Zero Trust →
   Access → Applications → Portal → Policies_), or Access stops them before the sign-in page.

**Forgotten password:** they use _Forgot password?_ on the sign-in page (a link valid for 1 hour).

**Removing someone:** _Team & Permissions → ⋯ → Deactivate_. All their sessions end at once, and
they can no longer sign in. With Access, also remove their email from the policy. Their history
(who did what) is kept.

## Fallback: no custom domain yet

Without a domain on Cloudflare, the app runs on `dsol-portal.pages.dev` and the API on
`dsol-portal-api.<account>.workers.dev`: two different sites. **Portal passwords don't work
there**, because browsers don't send the session cookie from one site to the other. Identity
must then come from Cloudflare Access, so this fallback needs Access (steps 7a–9). Then:

1. In `server/wrangler.toml` under `[env.production]`: remove `routes`, set `workers_dev = true`,
   set `APP_URL = "https://dsol-portal.pages.dev"` and
   `CORS_ORIGINS = "https://dsol-portal.pages.dev"` (exactly that origin, nothing else).
2. Build the app with the API address: in GitHub _Variables_, add
   `VITE_API_BASE = https://dsol-portal-api.<account>.workers.dev/api`. The deploy workflow
   passes it to the build; locally, set it in the shell before `npm run deploy:client:prod`.
3. In `client/public/_headers`, add that workers.dev origin to `connect-src`.
4. **Two** Access applications with the same Staff policy: one for `dsol-portal.pages.dev`, one for
   `dsol-portal-api.<account>.workers.dev`. Give each its own bypass applications for `api/public`
   and `api/health` on the workers.dev host. Put the **API** application's AUD tag in `ACCESS_AUD`.
5. Pages _preview_ deployments (`*.dsol-portal.pages.dev`) are public by default. Under _Workers &
   Pages → dsol-portal → Settings → General → Access policy_, turn on Access for previews.

Move to a custom domain as soon as you can. It removes CORS and the second Access application,
and the session cookie then covers both the app and the API.

With a custom domain, `workers_dev = false` (already set) means **no** unprotected
`*.workers.dev` address exists for the API. Keep it that way.
