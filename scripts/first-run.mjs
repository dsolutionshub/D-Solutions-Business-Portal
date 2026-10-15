// First run of an EMPTY environment (production starts with no demo data): company settings,
// default dropdown lists and the first Admin, plus a one-time link for the Admin to choose a
// password. Email templates come with migration 0002. Safe to run again: it never overwrites
// anything, and prints a fresh link only while the Admin has no password yet.
//
//   npm run first-run -- --env production --owner you@example.com --name "Your Name" --company "D Solutions"
//   npm run first-run -- --local --owner …        (try it on the local drill database)
//
// Run after `npm run db:migrate:prod`. The link uses APP_URL from wrangler.toml (or --app-url).
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { argValue, d1Query, dbTarget, fail, serverDir, sqlStr, wrangler } from './lib.mjs';

const target = dbTarget();
const owner = argValue('--owner')?.trim().toLowerCase();
const name = argValue('--name')?.trim();
const company = argValue('--company')?.trim() || 'D Solutions';
if (!owner || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner)) fail('Pass --owner <your email>.');
if (!name) fail('Pass --name "Your Name".');

// shared is TypeScript; tsx loads it
const { DEFAULT_LISTS, DEFAULT_NOTIFICATION_PREFS } = await import('../shared/src/index.ts').catch(() =>
  fail('Run this through npm (npm run first-run -- …) so TypeScript files can be loaded.')
);

/** The app's address for the link: --app-url, else APP_URL of the environment in wrangler.toml. */
function appUrl() {
  const given = argValue('--app-url');
  if (given) return given.replace(/\/$/, '');
  if (target.env === 'local') return 'http://localhost:5173';
  const toml = readFileSync(path.join(serverDir, 'wrangler.toml'), 'utf8');
  const section = toml.split(`[env.${target.env}.vars]`)[1]?.split(/\n\[/)[0] ?? '';
  const url = /APP_URL\s*=\s*"([^"]+)"/.exec(section)?.[1];
  return url ? url.replace(/\/$/, '') : fail('Set APP_URL in wrangler.toml or pass --app-url.');
}

// a one-time set-password link (72 h); only its SHA-256 is stored
const b64url = buf => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const linkToken = b64url(randomBytes(32));
const linkId = b64url(createHash('sha256').update(linkToken).digest());

const year = new Date().getFullYear();
const id = () => Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 8);
const listRows = Object.entries(DEFAULT_LISTS).flatMap(([key, values]) =>
  values.map(
    (v, i) =>
      `INSERT OR IGNORE INTO lists (id, list_key, value, sort_order) VALUES (${sqlStr(`lv_${id()}`)}, ${sqlStr(key)}, ${sqlStr(v)}, ${i});`
  )
);
const sql = [
  `INSERT OR IGNORE INTO settings (id, company, invoice_prefix, next_invoice_no, hourly_rate_paise, notification_prefs) VALUES (1, ${sqlStr(company)}, ${sqlStr(`INV-${year}-`)}, 1, 0, ${sqlStr(JSON.stringify(DEFAULT_NOTIFICATION_PREFS))});`,
  ...listRows,
  `INSERT OR IGNORE INTO users (id, email, name, role, status) VALUES (${sqlStr(`us_${id()}`)}, ${sqlStr(owner)}, ${sqlStr(name)}, 'Admin', 'Invited');`,
  // only while the Admin has no password yet
  `INSERT INTO password_resets (id, user_id, purpose, expires_at) SELECT ${sqlStr(linkId)}, id, 'invite', ${sqlStr(new Date(Date.now() + 72 * 3_600_000).toISOString())} FROM users WHERE email = ${sqlStr(owner)} AND password_hash IS NULL;`
];

const dir = mkdtempSync(path.join(tmpdir(), 'dsol-first-run-'));
const file = path.join(dir, 'first-run.sql');
try {
  writeFileSync(file, sql.join('\n') + '\n', { mode: 0o600 });
  console.log(
    `Writing settings, ${listRows.length} dropdown values and the Admin ${owner} to ${target.name}…`
  );
  wrangler(['d1', 'execute', 'DB', ...target.flags, '--file', file, '--yes'], { capture: true });
} finally {
  rmSync(dir, { recursive: true, force: true });
}

const [check] = d1Query(
  target,
  `SELECT (SELECT count(*) FROM users WHERE role = 'Admin') AS admins, (SELECT count(*) FROM email_templates) AS templates, (SELECT count(*) FROM lists) AS list_values, (SELECT password_hash IS NOT NULL FROM users WHERE email = ${sqlStr(owner)}) AS has_password`
);
console.log(
  `Admins: ${check.admins} · email templates: ${check.templates} · dropdown values: ${check.list_values}`
);
if (check.has_password)
  console.log(`\n✔ Done. ${owner} already has a password: sign in at ${appUrl()}/login`);
else
  console.log(
    `\n✔ Done. Open this link to choose your password (works once, for 72 hours; keep it private):\n\n   ${appUrl()}/reset-password?token=${linkToken}&invite=1\n\nThen Settings → Company & invoicing to finish the company details.`
  );
