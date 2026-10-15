# D Solutions Business Portal

An internal, staff-only tool for running an e-commerce agency. It keeps:

- **clients** and their contacts;
- **projects** with their full project sheet (URLs, domain & SSL, hosting, database, keys), with
  secrets encrypted;
- **releases**, **billable work**, **invoices** and **payments**;
- **renewals** and reminders (domains, SSL, hosting, subscriptions), the **Email Center** (Brevo)
  and **reports**.

Clients never sign in. Staff sign in with their work email and a portal password (invited by an
Admin, who emails them a set-password link); Cloudflare Access can be added in front as an extra
layer. Each person has one role: Admin, or a custom role an Admin creates with the
permissions they pick (Team & Permissions → Role permissions).

`/` is a public intro page, and `/login` the sign-in page. Everything else needs sign-in.

| Part     | Stack                                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------------------------ |
| `client` | React 18, Vite, TypeScript, Tailwind CSS 3, shadcn/ui, React Router 7, TanStack Query, RHF + Zod, Recharts, TipTap |
| `server` | Cloudflare Workers, Hono, Drizzle ORM, D1 (SQLite), Cron Triggers, Brevo                                           |
| `shared` | Zod schemas, types, constants, the permission map and pure business rules used by both                             |

Everything runs on free tiers: Cloudflare Workers and D1 (API and data), Netlify (the app) and Brevo (300 emails a day).

- Deploying: **[docs/DEPLOY.md](docs/DEPLOY.md)**.
- Running it (backups, restore, key rotation, limits): **[docs/OPERATIONS.md](docs/OPERATIONS.md)**.
- How data is protected: **[docs/SECURITY.md](docs/SECURITY.md)**.

## Run it locally

Requirements: Node 22 (20.19+ works) and npm 10+. You don't need a Cloudflare account, because
`wrangler dev` simulates D1 and cron on your machine.

```bash
npm install
cp server/.dev.vars.example server/.dev.vars    # set DEV_USER_EMAIL, SEED_OWNER_NAME, SEED_PASSWORD
npm run gen:key                                 # paste the output into ENCRYPTION_KEY in server/.dev.vars
npm run db:migrate:local && npm run db:seed     # empty local database; you are the only sign-in (Admin)
npm run dev                                     # app http://localhost:5173 · API http://localhost:8787/api
```

Open <http://localhost:5173> (it goes straight to the sign-in page) and sign in with `DEV_USER_EMAIL` and
`SEED_PASSWORD`. The seed adds no made-up records: just you as Admin, the company name, the
default dropdown lists and email templates. Add teammates from **Team** (they get an invite email;
locally the link is printed in the server console).

What `server/.dev.vars` (gitignored) holds:

- `ENVIRONMENT=development`: local mode. Session cookies work over plain http, password-reset links are printed instead of emailed, and automated tests may pass
  the Access email header. None of this is possible outside development.
- `DEV_USER_EMAIL`, `SEED_OWNER_NAME`, `SEED_PASSWORD`: your sign-in. The seed makes it the
  Admin. Leave `SEED_PASSWORD` empty and the seed generates a strong one and prints it.
- `SEED_COMPANY`: the company name the seed puts in Settings (default `D Solutions`).
- `ENCRYPTION_KEY`: AES-256 key for project secrets (`npm run gen:key`).
- `BREVO_API_KEY`: leave it empty. Emails are then printed to the server console and saved as
  "Logged (dev)" instead of being sent.

To run the daily job locally: Settings → Data → **Run now**, or
`curl "http://localhost:8787/__scheduled?cron=30+2+*+*+*"`.

## Tests

| Command                                                       | What it checks                                                                                                                                                                          |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                                                    | Unit and API tests. API tests run the real Worker against an in-memory D1 with the real migrations.                                                                                     |
| `npm run test:coverage`                                       | The same, with a coverage report (`server/coverage`). Must stay at 80% or more on `server/src/services`.                                                                                |
| `npm run test:e2e`                                            | Playwright journeys, 390px layout, dark mode and axe accessibility on every page. Uses its own seeded database and ports (5174/8788). Run `npx playwright install chromium` once first. |
| `npm run typecheck` · `npm run lint` · `npm run format:check` | Static checks                                                                                                                                                                           |
| `npm run check:bundle`                                        | Fails if anything secret-looking is in the built client                                                                                                                                 |

CI runs all of these on every pull request (`.github/workflows/ci.yml`).

## All scripts

| Command                                                             | What it does                                                            |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `npm run dev`                                                       | App + API together                                                      |
| `npm run build`                                                     | Production build of the app (`client/dist`)                             |
| `npm run db:generate`                                               | New SQL migration from `server/src/db/schema.ts`                        |
| `npm run db:migrate:local` / `:staging` / `:prod`                   | Apply migrations                                                        |
| `npm run db:seed`                                                   | Wipe the **local** database back to real starting data (you as Admin)   |
| `npm run setup:staging` / `setup:prod`                              | Create the Cloudflare D1 database if missing (docs/DEPLOY.md)           |
| `npm run first-run -- --env production --owner … --name …`          | Empty production: settings, dropdown lists, first Admin                 |
| `npm run deploy:staging` / `deploy:prod`                            | Migrate → Worker (CI does this on push; Netlify builds the app)         |
| `npm run backup -- --env production`                                | Encrypted export (CI does this weekly)                                  |
| `npm run restore -- --env staging --file … --identity … --counts …` | Restore a backup (docs/OPERATIONS.md)                                   |
| `npm run backup:keygen -- --out <path>`                             | Create the backup encryption key pair                                   |
| `npm run rotate-key -- --env production [--apply]`                  | Re-encrypt all secrets with a new `ENCRYPTION_KEY` (docs/OPERATIONS.md) |
| `npm run gen:key`                                                   | Print a new random `ENCRYPTION_KEY`                                     |

## Folder structure

```
client/                 the app (hosted on Netlify)
  public/_headers       security headers (CSP, HSTS, …) for the app
  src/app/              shell, router (every page is lazy-loaded), layout, theme
  src/components/       shared UI (ui/ = shadcn primitives, common/ = app building blocks)
  src/features/<area>/  one folder per area: api.ts (calls + hooks), pages/, components/
  src/lib/              API client, auth (useCan), forms, list params
server/                 the API (Cloudflare Worker)
  src/index.ts          routes + middleware order (logs → headers → auth → permissions)
  src/middleware/       auth (Access JWT), permissions, hardening, errors, validation
  src/routes/           one Hono router per area (+ *.api.test.ts next to them)
  src/db/schema.ts      Drizzle schema (source of the migrations)
  src/db/repos/         queries and business operations
  src/services/         pure logic: crypto, invoice maths, alerts, renewals, email, links, Access JWT
  src/cron/daily.ts     the daily job (digests, reminders, scheduled emails, watchdog)
  migrations/           SQL migrations (add-only, so deploys are backward-compatible)
  seed/                 local starting data (Admin, settings, lists)
  e2e-fixture/          made-up records for the end-to-end tests only
  scripts/              gen-key, rotate-key, drizzle-kit wrapper
shared/src/             Zod schemas, constants, permissions, defaults, dates, money, renderers
scripts/                deployment, first run, backup / restore, bundle check
e2e/                    Playwright end-to-end tests
docs/                   DEPLOY, OPERATIONS, SECURITY
.github/workflows/      ci, deploy, backup, health
```

## How to…

### Add a page

1. Create `client/src/features/<area>/pages/MyPage.tsx` with `export function MyPage()`. Start
   with `<PageHeader>`, and handle loading (skeletons), empty (`EmptyState`) and error (`ErrorState`).
2. Register it in `client/src/app/router.tsx`. Add a `lazyPage(() => import(...), m => m.MyPage, 'list')`
   entry to `page`, then a route with `handle: crumb('My page')`. Wrap the element in
   `<RequirePermission permission="…">` if not every role may open it.
3. To show it in the menu, add it to `client/src/app/layout/nav.ts`, with `permission` if it is restricted.
4. Data comes from `features/<area>/api.ts` (TanStack Query hooks). Server routes go in
   `server/src/routes/`, mounted in `server/src/index.ts`, with `requirePermission(...)` on every
   route that isn't for everyone.

### Add a project sheet field

1. `shared/src/schemas/projectSheet.ts`: add the field to its section in `SHEET_SECTIONS`, giving its
   label, type (`text`, `url`, `date`, `money`, `secret`, …) and select list if it has one.
   Forms, the details view, the sheet download and validation all follow from this.
2. **Not a secret:** add the column to `projectSheet` in `server/src/db/schema.ts`, named
   `section_field` in snake case (`server/src/db/sheetMap.ts` maps them by that rule). Then
   `npm run db:generate`.
   **A secret:** add it to `SECRET_FIELD_KEYS`. It's stored encrypted in `project_secrets`, so no
   column is needed.
3. If roles without “View project sheets” should see it (costs and dates only), add it to
   `COST_SHEET_FIELDS`.
4. `npm test`: the sheet mapping tests check every field has a column.

### Add a dropdown list

1. `shared/src/constants.ts`: add the key to `LIST_KEYS`.
2. `shared/src/defaults.ts`: add starting values (used by `first-run` and the demo seed).
3. `client/src/features/settings/components/DropdownListsTab.tsx`: give it a title and hint in `LIST_INFO`.
4. `server/src/db/repos/admin.ts` → `listUsage`: count the records that use a value. Removing a
   value never changes those records.
5. In forms, use `listOptions(lists, 'myKey', currentValue)` so an old value stays selectable.

Values themselves are edited by Admins in Settings → Dropdown lists. No code change is needed.

### Add an email template

Admins add or edit templates in **Email Center → Templates**. Variables such as
`{{client_name}}` and `{{invoice_no}}` are filled in when composing. To add a new variable:

1. Add it to `TEMPLATE_VARIABLES` in `shared/src/constants.ts`.
2. Fill it where emails are prepared: `prefill()` in `server/src/db/repos/emails.ts` and
   `applyTemplate` in `ComposeForm.tsx`.

To ship a template in every new installation, add it to `shared/src/render/defaultTemplates.ts`
and add a migration that inserts it (see `migrations/0002_default_templates.sql`).

### Add a permission

1. `shared/src/permissions.ts`: add `'area.action'` to `PERMISSION_KEYS` (Admin gets it
   automatically; add it to `ADMIN_ONLY_PERMISSIONS` if custom roles must never have it)
   and a line to `PERMISSION_GROUPS` (the Role permissions page and the role editor).
2. Server: `requirePermission('area.action')` on the route.
3. Client: `useCan('area.action')` to hide or disable the button, and `permission` on the nav item
   or `<RequirePermission>` on the route.
4. Add an API test that a role without it gets 403 (see `roles.api.test.ts`).
