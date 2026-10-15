/**
 * Starting data for the LOCAL database — `npm run db:seed`. No made-up records: it gives you an
 * empty portal ready for real data, the same starting point `first-run` gives production.
 *
 *   - one sign-in: the Admin, DEV_USER_EMAIL / SEED_OWNER_NAME / SEED_PASSWORD from .dev.vars
 *     (no SEED_PASSWORD → a strong one is generated and printed once)
 *   - company settings (SEED_COMPANY, default "D Solutions"), the default dropdown lists and the
 *     default email templates
 *
 * Builds seed/.seed.sql and the npm script applies it with `wrangler d1 execute DB --local`.
 * Every table is cleared first, so running it again wipes the local database.
 * (The end-to-end tests load their own made-up records from e2e-fixture/, never this.)
 */
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_EMAIL_DAILY_LIMIT,
  DEFAULT_EMAIL_TEMPLATES,
  DEFAULT_LISTS,
  DEFAULT_NOTIFICATION_PREFS,
  newPassword,
  settingsCreateSchema
} from '@dsol/shared';
import { getTableColumns, getTableName, type InferInsertModel } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import * as t from '../src/db/schema';
import { hashPassword } from '../src/services/password';

const here = import.meta.dirname;

/* ------------------------------------------------------------- environment */

function devVars(): Record<string, string> {
  try {
    const text = readFileSync(path.join(here, '..', '.dev.vars'), 'utf8');
    return Object.fromEntries(
      text
        .split(/\r?\n/)
        .filter(l => /^\s*[A-Z0-9_]+\s*=/.test(l))
        .map(l => {
          const i = l.indexOf('=');
          return [
            l.slice(0, i).trim(),
            l
              .slice(i + 1)
              .trim()
              .replace(/^"(.*)"$/, '$1')
          ];
        })
    );
  } catch {
    return {};
  }
}
const vars = { ...devVars(), ...process.env };
const fail = (msg: string): never => {
  console.error(msg);
  process.exit(1);
};

const OWNER_EMAIL = (vars.DEV_USER_EMAIL ?? '').trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(OWNER_EMAIL))
  fail('Set DEV_USER_EMAIL (your work email) in server/.dev.vars — it becomes the Admin sign-in.');
const OWNER_NAME = vars.SEED_OWNER_NAME?.trim() || OWNER_EMAIL.split('@')[0]!;
const COMPANY = vars.SEED_COMPANY?.trim() || 'D Solutions';

const generated = !vars.SEED_PASSWORD;
const PASSWORD = vars.SEED_PASSWORD || randomBytes(12).toString('base64url');
const pw = newPassword.safeParse(PASSWORD);
if (!pw.success) fail(`SEED_PASSWORD in server/.dev.vars is too weak: ${pw.error.issues[0]!.message}`);

/* ---------------------------------------------------------- SQL generation */

const literal = (v: unknown): string => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? '1' : '0';
  return `'${String(v).replace(/'/g, "''")}'`;
};

const statements: string[] = [];

function insert<T extends SQLiteTable>(table: T, rows: InferInsertModel<T>[]) {
  const cols = Object.entries(getTableColumns(table));
  for (const row of rows) {
    const present = cols.filter(([k]) => (row as Record<string, unknown>)[k] !== undefined);
    const names = present.map(([, c]) => `"${c.name}"`).join(', ');
    const values = present
      .map(([k, c]) => {
        const v = (row as Record<string, unknown>)[k];
        return literal(v === null ? null : c.mapToDriverValue(v));
      })
      .join(', ');
    statements.push(`INSERT INTO "${getTableName(table)}" (${names}) VALUES (${values});`);
  }
}

/* -------------------------------------------------------------------- data */

const now = new Date().toISOString();
const owner: InferInsertModel<typeof t.users> = {
  id: 'us_owner',
  email: OWNER_EMAIL,
  name: OWNER_NAME,
  role: 'Admin',
  status: 'Active',
  passwordHash: await hashPassword(PASSWORD),
  passwordUpdatedAt: now
};

const settings = settingsCreateSchema.parse({
  company: COMPANY,
  address: null,
  gstin: null,
  bank: null,
  upi: null,
  invoicePrefix: `INV-${new Date().getFullYear()}-`,
  nextInvoiceNo: 1,
  hourlyRatePaise: 0,
  notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
  emailFromName: null,
  emailFromAddress: null,
  timezone: 'Asia/Kolkata',
  emailDailyLimit: DEFAULT_EMAIL_DAILY_LIMIT,
  clientOverdueReminders: false
});

const lists = Object.entries(DEFAULT_LISTS).flatMap(([key, values]) =>
  (values as readonly string[]).map((value, i) => ({
    id: `lv_${key}_${i}`,
    listKey: key as 'state',
    value,
    sortOrder: i
  }))
);

// the defaults every installation gets — see migrations/0002
const templates = DEFAULT_EMAIL_TEMPLATES.map((tpl, i) => ({ id: `et_default_${i + 1}`, ...tpl }));

/* ------------------------------------------------------------------- write */

// Children before parents, so foreign keys never block the clear.
const clearOrder: SQLiteTable[] = [
  t.auditLog,
  t.alertState,
  t.cronRuns,
  t.reminderLog,
  t.sessions,
  t.passwordResets,
  t.notices,
  t.emails,
  t.payments,
  t.invoiceLines,
  t.workItems,
  t.invoices,
  t.renewalHistory,
  t.releaseItems,
  t.releases,
  t.projectCosts,
  t.extraKeys,
  t.projectSecrets,
  t.projectSheet,
  t.projects,
  t.contacts,
  t.clients,
  t.emailTemplates,
  t.lists,
  t.settings,
  t.users,
  t.roles
];
for (const table of clearOrder) statements.push(`DELETE FROM "${getTableName(table)}";`);

insert(t.users, [owner]);
insert(t.settings, [{ id: 1, ...settings }]);
insert(t.lists, lists);
insert(t.emailTemplates, templates);

writeFileSync(
  path.join(here, '.seed.sql'),
  '-- Generated by seed/seed.ts — do not edit. Local development only.\n' + statements.join('\n') + '\n'
);

console.log(
  `Seed SQL written: company "${COMPANY}", ${lists.length} dropdown values, ${templates.length} email templates, no other records.`
);
console.log(`Sign in at http://localhost:5173/login as ${OWNER_EMAIL} (Admin, ${OWNER_NAME}).`);
if (generated)
  console.log(
    `Generated password: ${PASSWORD}\n  Save it, or set SEED_PASSWORD in server/.dev.vars so re-seeding keeps the same one.`
  );
else console.log('Password: SEED_PASSWORD from server/.dev.vars.');
