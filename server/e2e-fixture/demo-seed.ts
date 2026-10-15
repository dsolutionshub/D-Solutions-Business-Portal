/**
 * Test fixture for the END-TO-END tests only (e2e/prepare-db.ts) — never loaded into the portal's
 * own local or deployed databases (`npm run db:seed` loads real starting data only).
 *
 * Builds e2e-fixture/.demo.sql from demo-data.json (made-up clients, projects and invoices the
 * browser tests click through). Every table is cleared first.
 *
 *   - money is converted from rupees to paise
 *   - secrets are the placeholder "demo-placeholder-not-a-real-secret", encrypted with
 *     ENCRYPTION_KEY from .dev.vars — the database only ever holds ciphertext
 *   - the first Admin's email is DEV_USER_EMAIL from .dev.vars, so local sign-in maps to them
 *   - every other email address uses the reserved .example domain and can never be delivered
 *   - rows are checked against the shared Zod schemas before anything is written
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  addDays,
  clientCreateSchema,
  contactCreateSchema,
  DEFAULT_EMAIL_DAILY_LIMIT,
  DEFAULT_EMAIL_TEMPLATES,
  invoiceCreateSchema,
  projectCreateSchema,
  projectSheetCreateSchema,
  releaseCreateSchema,
  rupeesToPaise,
  SECRET_FIELD_KEYS,
  settingsCreateSchema,
  todayIso,
  workItemCreateSchema,
  type ProjectSheetCreate,
  type RenewalKind
} from '@dsol/shared';
import { getTableColumns, getTableName, type InferInsertModel } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { z } from 'zod';
import type demoData from './demo-data.json';
import * as t from '../src/db/schema';
import { encrypt, extraKeyAad, secretAad } from '../src/services/crypto';
import { hashPassword } from '../src/services/password';
import { invoiceCalc } from '../src/services/invoiceCalc';
import { TEST_ROLES } from './testRoles';

const here = import.meta.dirname;
type Demo = typeof demoData;
const demo = JSON.parse(readFileSync(path.join(here, 'demo-data.json'), 'utf8')) as Demo;

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
const KEY = vars.ENCRYPTION_KEY ?? '';
if (!KEY) {
  console.error('ENCRYPTION_KEY is missing. Run `npm run gen:key` and put it in server/.dev.vars.');
  process.exit(1);
}
const OWNER_EMAIL = (vars.SEED_OWNER_EMAIL || vars.DEV_USER_EMAIL || 'owner@example.com')
  .trim()
  .toLowerCase();

/* ----------------------------------------------------------------- helpers */

const blank = (v: unknown): string | null =>
  v === undefined || v === null || String(v).trim() === '' ? null : String(v);
const paise = (rupees: unknown): number => rupeesToPaise(rupees as number) ?? 0;
const paiseOrNull = (rupees: unknown): number | null => (blank(rupees) === null ? null : paise(rupees));
const uid = (code: string) => `us_${code.toLowerCase()}`;
const cid = (key: string) => `cl_${key}`;
const pid = (key: string) => `pj_${key}`;
const rid = (key: string) => `rl_${key}`;
const wid = (key: string) => `wk_${key}`;
const iid = (no: string) => `in_${no.replace(/^INV-/, '').replace(/-/g, '_')}`;

/** Prototype email dates are IST wall time "YYYY-MM-DD HH:mm" → UTC ISO. */
const istToUtc = (s: string): string | null =>
  s ? new Date(s.replace(' ', 'T') + ':00+05:30').toISOString() : null;

function check<T extends z.ZodType>(schema: T, value: unknown, what: string): z.output<T> {
  const r = schema.safeParse(value);
  if (!r.success) {
    console.error(`Seed data failed validation (${what}):`);
    for (const i of r.error.issues) console.error(`  ${i.path.join('.')}: ${i.message}`);
    process.exit(1);
  }
  return r.data;
}

/* ---------------------------------------------------------- SQL generation */

const literal = (v: unknown): string => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error('Non-finite number in seed');
    return String(v);
  }
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

// users
const users: InferInsertModel<typeof t.users>[] = demo.users.map(u => ({
  id: uid(u.code),
  email: u.email === '{{OWNER_EMAIL}}' ? OWNER_EMAIL : u.email.toLowerCase(),
  name: u.name,
  role: u.role === 'Owner' ? 'Admin' : u.role === 'Admin' ? 'Manager' : u.role,
  status: u.status as 'Active'
}));

// Sign-in: every active test user gets the fixed test password (e2e/helpers.ts TEST_PASSWORD).
// Invited users have none yet — they set one from their invite link.
const SEED_PASSWORD = 'E2e-Fixture-Pass-2026';
for (const u of users)
  if (u.status === 'Active') {
    u.passwordHash = await hashPassword(SEED_PASSWORD);
    u.passwordUpdatedAt = new Date().toISOString();
  }

// settings
const settings = check(
  settingsCreateSchema,
  {
    company: demo.settings.company,
    address: blank(demo.settings.address),
    gstin: blank(demo.settings.gstin),
    bank: blank(demo.settings.bank),
    upi: blank(demo.settings.upi),
    invoicePrefix: demo.settings.prefix,
    nextInvoiceNo: demo.settings.nextNo,
    hourlyRatePaise: paise(demo.settings.hourlyRate),
    notificationPrefs: demo.notifPrefs,
    emailFromName: null,
    emailFromAddress: null,
    timezone: 'Asia/Kolkata',
    emailDailyLimit: DEFAULT_EMAIL_DAILY_LIMIT,
    clientOverdueReminders: false
  },
  'settings'
);

// dropdown lists
const lists = Object.entries(demo.lists).flatMap(([key, values]) =>
  (values as string[]).map((value, i) => ({
    id: `lv_${key}_${i}`,
    listKey: key as 'state',
    value,
    sortOrder: i
  }))
);

// email templates (the defaults every installation gets — see migrations/0002)
const templates = DEFAULT_EMAIL_TEMPLATES.map((tpl, i) => ({ id: `et_default_${i + 1}`, ...tpl }));
/** Prototype template names → the names used now. */
const TEMPLATE_RENAMES: Record<string, string> = {
  'Scheduled Maintenance': 'Maintenance Notice',
  'General Business Announcement': 'General'
};

// a manual notice: the next maintenance window, two days from today
const notices: InferInsertModel<typeof t.notices>[] = [
  {
    id: 'nt_demo_1',
    title: 'Kaveri maintenance window',
    body: '1:00–2:00 AM IST · clients notified',
    date: addDays(todayIso(), 2),
    type: 'Upcoming maintenance',
    createdBy: users[0]!.id
  }
];

// clients + contacts
const clients: InferInsertModel<typeof t.clients>[] = [];
const contacts: InferInsertModel<typeof t.contacts>[] = [];
for (const c of demo.clients) {
  const primary = c.contacts.find(x => x.tag === 'Primary');
  const parsed = check(
    clientCreateSchema,
    {
      name: c.name,
      type: blank(c.type),
      industry: blank(c.industry),
      website: c.website,
      since: blank(c.since),
      description: blank(c.desc),
      addr1: c.addr1,
      addr2: blank(c.addr2),
      city: c.city,
      state: blank(c.state),
      pin: c.zip,
      gstin: blank(c.gstin),
      currency: c.currency,
      paymentTerms: c.terms,
      billingAddress: blank(c.billing),
      notes: blank(c.notes),
      status: c.status,
      primaryContact: {
        name: primary?.name ?? c.contact,
        role: blank(primary?.role ?? c.contactRole),
        email: primary?.email ?? c.email,
        phone: primary?.phone ?? c.phone,
        altPhone: blank(c.alt)
      }
    },
    `client ${c.name}`
  );
  const { primaryContact: _primary, ...clientRow } = parsed;
  clients.push({ id: cid(c.id), color: c.color, ...clientRow });
  c.contacts.forEach((x, i) => {
    const row = check(
      contactCreateSchema,
      {
        clientId: cid(c.id),
        name: x.name,
        role: blank(x.role),
        email: x.email,
        phone: blank(x.phone),
        altPhone: x.tag === 'Primary' ? blank(c.alt) : null,
        tag: x.tag,
        notifyReleases: x.notify
      },
      `contact ${x.name}`
    );
    contacts.push({ id: `ct_${c.id}_${i + 1}`, ...row });
  });
}

// projects + sheets + secrets + other keys + costs
type ProtoSheet = Record<string, Record<string, string>> & {
  extraKeys: { label: string; value: string; secret: boolean }[];
  costs: { name: string; amount: string; cycle: string; nextDue: string }[];
  notes: string;
};
const projects: InferInsertModel<typeof t.projects>[] = [];
const sheets: InferInsertModel<typeof t.projectSheet>[] = [];
const secrets: InferInsertModel<typeof t.projectSecrets>[] = [];
const extraKeys: InferInsertModel<typeof t.extraKeys>[] = [];
const costs: InferInsertModel<typeof t.projectCosts>[] = [];

for (const p of demo.projects) {
  const id = pid(p.id);
  const proto = p.sheet as unknown as ProtoSheet;
  const project = check(
    projectCreateSchema,
    {
      clientId: cid(p.client),
      name: p.name,
      type: blank(p.type),
      status: p.status,
      startDate: blank(p.start),
      stack: blank(p.stack),
      environments: p.envs
    },
    `project ${p.name}`
  );
  projects.push({ id, ...project });

  const g = (section: string, key: string) => blank(proto[section]?.[key]);
  const sheet: ProjectSheetCreate = check(
    projectSheetCreateSchema,
    {
      links: {
        prod: g('links', 'prod') ?? p.url,
        staging: g('links', 'staging'),
        admin: g('links', 'admin'),
        api: g('links', 'api'),
        apiStaging: g('links', 'apiStaging'),
        repo: g('links', 'repo')
      },
      domain: {
        name: g('domain', 'name'),
        registrar: g('domain', 'registrar'),
        account: g('domain', 'account'),
        purchased: g('domain', 'purchased'),
        expiry: g('domain', 'expiry'),
        cost: paiseOrNull(g('domain', 'cost')),
        renewal: paiseOrNull(g('domain', 'renewal')),
        auto: g('domain', 'auto') === 'On' ? 'On' : 'Off',
        dns: g('domain', 'dns'),
        sslProvider: g('domain', 'sslProvider'),
        sslExpiry: g('domain', 'sslExpiry'),
        sslCost: paiseOrNull(g('domain', 'sslCost'))
      },
      hosting: {
        platform: g('hosting', 'platform'),
        plan: g('hosting', 'plan'),
        region: g('hosting', 'region'),
        ip: g('hosting', 'ip'),
        account: g('hosting', 'account'),
        cost: paiseOrNull(g('hosting', 'cost')),
        cycle: g('hosting', 'cycle'),
        nextBill: g('hosting', 'nextBill')
      },
      db: {
        engine: g('db', 'engine'),
        host: g('db', 'host'),
        port: g('db', 'port'),
        name: g('db', 'name'),
        user: g('db', 'user'),
        console: g('db', 'console'),
        backup: g('db', 'backup')
      },
      keys: {
        googleClientId: g('keys', 'googleClientId'),
        payGateway: g('keys', 'payGateway'),
        payKeyId: g('keys', 'payKeyId'),
        shipping: g('keys', 'shipping'),
        ga4: g('keys', 'ga4'),
        pixel: g('keys', 'pixel')
      },
      notes: blank(proto.notes)
    },
    `sheet of ${p.name}`
  );
  sheets.push({
    projectId: id,
    linksProd: sheet.links.prod,
    linksStaging: sheet.links.staging,
    linksAdmin: sheet.links.admin,
    linksApi: sheet.links.api,
    linksApiStaging: sheet.links.apiStaging,
    linksRepo: sheet.links.repo,
    domainName: sheet.domain.name,
    domainRegistrar: sheet.domain.registrar,
    domainAccount: sheet.domain.account,
    domainPurchased: sheet.domain.purchased,
    domainExpiry: sheet.domain.expiry,
    domainCostPaise: sheet.domain.cost,
    domainRenewalPaise: sheet.domain.renewal,
    domainAutoRenew: sheet.domain.auto === 'On',
    domainDns: sheet.domain.dns,
    domainSslProvider: sheet.domain.sslProvider,
    domainSslExpiry: sheet.domain.sslExpiry,
    domainSslCostPaise: sheet.domain.sslCost,
    hostingPlatform: sheet.hosting.platform,
    hostingPlan: sheet.hosting.plan,
    hostingRegion: sheet.hosting.region,
    hostingIp: sheet.hosting.ip,
    hostingAccount: sheet.hosting.account,
    hostingCostPaise: sheet.hosting.cost,
    hostingCycle: sheet.hosting.cycle,
    hostingNextBill: sheet.hosting.nextBill,
    dbEngine: sheet.db.engine,
    dbHost: sheet.db.host,
    dbPort: sheet.db.port,
    dbName: sheet.db.name,
    dbUser: sheet.db.user,
    dbConsole: sheet.db.console,
    dbBackup: sheet.db.backup,
    keysGoogleClientId: sheet.keys.googleClientId,
    keysPayGateway: sheet.keys.payGateway,
    keysPayKeyId: sheet.keys.payKeyId,
    keysShipping: sheet.keys.shipping,
    keysGa4: sheet.keys.ga4,
    keysPixel: sheet.keys.pixel,
    notes: sheet.notes
  });

  for (const fieldKey of SECRET_FIELD_KEYS) {
    const [section, key] = fieldKey.split('.') as [string, string];
    const plain = g(section, key);
    if (!plain) continue;
    secrets.push({
      projectId: id,
      fieldKey,
      ...(await encrypt(plain, KEY, secretAad(id, fieldKey))),
      updatedBy: uid('KN')
    });
  }

  for (const [i, k] of (proto.extraKeys ?? []).entries()) {
    const xid = `xk_${p.id}_${i + 1}`;
    extraKeys.push(
      k.secret
        ? {
            id: xid,
            projectId: id,
            label: k.label,
            isSecret: true,
            ...(await encrypt(k.value, KEY, extraKeyAad(id, xid))),
            sortOrder: i
          }
        : { id: xid, projectId: id, label: k.label, isSecret: false, valuePlain: k.value, sortOrder: i }
    );
  }

  (proto.costs ?? []).forEach((c, i) =>
    costs.push({
      id: `pc_${p.id}_${i + 1}`,
      projectId: id,
      name: c.name,
      amountPaise: paise(c.amount),
      cycle: c.cycle as 'Monthly',
      nextDue: blank(c.nextDue),
      sortOrder: i
    })
  );
}

// releases + items
const releases: InferInsertModel<typeof t.releases>[] = [];
const releaseItems: InferInsertModel<typeof t.releaseItems>[] = [];
for (const r of demo.releases) {
  const rel = check(
    releaseCreateSchema,
    {
      projectId: pid(r.project),
      version: r.version,
      environment: r.env,
      releaseDate: r.date,
      status: r.status,
      releasedBy: uid(r.by),
      features: r.features,
      fixes: r.fixes,
      issues: r.issues
    },
    `release ${r.version}`
  );
  const { features, fixes, issues, ...row } = rel;
  releases.push({ id: rid(r.id), ...row, mailStatus: r.mail as 'Sent' });
  let n = 0;
  for (const [kind, list] of [
    ['Feature', features],
    ['Bug fix', fixes],
    ['Known issue', issues]
  ] as const)
    list.forEach((text, i) =>
      releaseItems.push({ id: `ri_${r.id}_${++n}`, releaseId: rid(r.id), kind, text, sortOrder: i })
    );
}

// invoices + lines (paise)
const invoices: InferInsertModel<typeof t.invoices>[] = [];
const invoiceLines: InferInsertModel<typeof t.invoiceLines>[] = [];
for (const v of demo.invoices) {
  const lines = v.lines.map(l => ({
    description: l.d,
    quantity: l.q,
    unitPricePaise: paise(l.p),
    workItemId: 'work' in l && l.work ? wid(l.work as string) : null
  }));
  const inv = check(
    invoiceCreateSchema,
    {
      clientId: cid(v.client),
      projectId: pid(v.project),
      issueDate: v.date,
      dueDate: v.due,
      discountPct: v.disc,
      gstRate: v.gst,
      notes: null,
      paymentInstructions: null,
      terms: null,
      status: v.status,
      lines
    },
    `invoice ${v.no}`
  );
  const { lines: _lines, ...row } = inv;
  invoices.push({ id: iid(v.no), number: v.no, ...row });
  lines.forEach((l, i) =>
    invoiceLines.push({ id: `il_${iid(v.no).slice(3)}_${i + 1}`, invoiceId: iid(v.no), ...l, sortOrder: i })
  );
}

// work items (after invoices: work_items.invoice_id → invoices)
const workItems: InferInsertModel<typeof t.workItems>[] = demo.work.map(w => {
  const row = check(
    workItemCreateSchema,
    {
      projectId: pid(w.project),
      releaseId: w.release ? rid(w.release) : null,
      type: w.type,
      title: w.title,
      deliveredOn: w.delivered,
      billing: w.billing,
      amountPaise: paise(w.amount),
      hours: w.hours,
      ratePaise: paise(w.rate),
      note: blank('note' in w ? w.note : null)
    },
    `work ${w.title}`
  );
  return { id: wid(w.id), ...row, invoiceId: w.invoice ? iid(w.invoice) : null };
});

// payments. The prototype rounded GST to whole rupees; in paise an invoice total can carry paise
// (INV-2026-0142 is ₹1,20,000.10). A demo payment within ₹1 of the total is taken as payment in full.
const payments: InferInsertModel<typeof t.payments>[] = demo.payments.map(p => {
  const v = demo.invoices.find(x => x.no === p.invoice)!;
  const { totalPaise } = invoiceCalc({
    status: 'Sent',
    dueDate: v.due,
    discountPct: v.disc,
    gstRate: v.gst,
    lines: v.lines.map(l => ({ quantity: l.q, unitPricePaise: paise(l.p) })),
    payments: []
  });
  const amount = paise(p.amount);
  return {
    id: `py_${p.id.replace('RCPT-', '')}`,
    receiptNo: p.id,
    invoiceId: iid(p.invoice),
    paidOn: p.date,
    method: p.method as 'NEFT',
    reference: p.ref,
    amountPaise: Math.abs(totalPaise - amount) < 100 ? totalPaise : amount
  };
});

// renewal history
const kindOf = (name: string): RenewalKind =>
  /ssl|^\*\./i.test(name) ? 'SSL' : /shopify|hosting|lightsail|vercel/i.test(name) ? 'Hosting' : 'Domain';
const renewals: InferInsertModel<typeof t.renewalHistory>[] = demo.renewHistory.map((h, i) => {
  const domain = h.name.replace(/^\*\./, '').replace(/ SSL$/, '');
  const project = sheets.find(s => s.domainName === domain) ?? null;
  return {
    id: `rn_${i + 1}`,
    clientId: cid(h.client),
    projectId: project?.projectId ?? null,
    kind: kindOf(h.name),
    itemName: h.name,
    renewedOn: h.date,
    amountPaise: paise(h.amount),
    period: h.period,
    renewedBy: h.by
  };
});

// emails
const emails: InferInsertModel<typeof t.emails>[] = demo.emails.map(e => {
  const client = demo.clients.find(c => c.id === e.client)!;
  const to = e.to
    .split(/,\s*/)
    .map(n => (n.includes('@') ? n : (client.contacts.find(c => c.name === n)?.email ?? '')));
  const release = demo.releases.find(r => r.client === e.client && e.subject.includes(r.version));
  return {
    id: `em_${e.id}`,
    clientId: cid(e.client),
    toAddresses: to.filter(Boolean),
    toText: e.to,
    subject: e.subject,
    templateName: TEMPLATE_RENAMES[e.template] ?? e.template,
    recipientCount: to.filter(Boolean).length || 1,
    bodyHtml: null,
    status: e.status as 'Sent',
    sendAt: istToUtc(e.date),
    releaseId: release ? rid(release.id) : null
  };
});

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

insert(
  t.roles,
  Object.entries(TEST_ROLES).map(([name, permissions]) => ({
    id: `ro_${name.toLowerCase()}`,
    name,
    permissions
  }))
);
insert(t.users, users);
insert(t.settings, [{ id: 1, ...settings }]);
insert(t.lists, lists);
insert(t.emailTemplates, templates);
insert(t.clients, clients);
insert(t.contacts, contacts);
insert(t.projects, projects);
insert(t.projectSheet, sheets);
insert(t.projectSecrets, secrets);
insert(t.extraKeys, extraKeys);
insert(t.projectCosts, costs);
insert(t.releases, releases);
insert(t.releaseItems, releaseItems);
insert(t.invoices, invoices);
insert(t.workItems, workItems);
insert(t.invoiceLines, invoiceLines);
insert(t.payments, payments);
insert(t.renewalHistory, renewals);
insert(t.emails, emails);
insert(t.notices, notices);

const out = path.join(here, '.demo.sql');
writeFileSync(
  out,
  '-- Generated by e2e-fixture/demo-seed.ts — do not edit. End-to-end tests only.\n' +
    statements.join('\n') +
    '\n'
);

const counts = {
  users: users.length,
  clients: clients.length,
  contacts: contacts.length,
  projects: projects.length,
  secrets: secrets.length,
  extraKeys: extraKeys.length,
  costs: costs.length,
  releases: releases.length,
  workItems: workItems.length,
  invoices: invoices.length,
  invoiceLines: invoiceLines.length,
  payments: payments.length,
  renewals: renewals.length,
  emails: emails.length,
  templates: templates.length,
  listValues: lists.length
};
console.log(`E2E fixture SQL written (${statements.length} statements). Admin: ${OWNER_EMAIL}`);
console.log(
  Object.entries(counts)
    .map(([k, n]) => `${k} ${n}`)
    .join(' · ')
);
