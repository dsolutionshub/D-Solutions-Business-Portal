/**
 * The project sheet — everything needed to run a client's store, one sheet per project.
 * Infrastructure, Credentials, Domains, Renewals and Notifications all read from it.
 *
 * SHEET_SECTIONS is the field list from the prototype (sheet-fields.js), unchanged: forms, the
 * project page, the vault and exports are generated from it. A test checks it matches the prototype.
 *
 * Value rules:
 *   - empty optional fields are null
 *   - money fields are integer paise
 *   - `secret` fields are NOT in the sheet schema: they are stored encrypted in project_secrets
 *     and only read through the reveal endpoint (see projectSecret.ts)
 */
import { z } from 'zod';
import { BILLING_CYCLES, type ListKey } from '../constants';
import { domainName, httpUrl, id, isoDate, isoDateTime, optionalText, paise } from './common';

export type SheetFieldType = 'text' | 'url' | 'domain' | 'date' | 'money' | 'secret' | 'select';

export interface SheetFieldDef {
  key: string;
  label: string;
  type: SheetFieldType;
  /** Required on the project form. */
  required?: boolean;
  /** Non-secret value that is also listed in the Credentials vault (logins, client IDs). */
  vault?: boolean;
  /** Dropdown values come from Settings → Dropdown lists. */
  list?: ListKey;
  /** Fixed dropdown values. */
  options?: readonly string[];
}

export interface SheetSectionDef {
  key: 'links' | 'domain' | 'hosting' | 'db' | 'keys';
  title: string;
  desc: string;
  fields: readonly SheetFieldDef[];
}

export const SHEET_SECTIONS = [
  {
    key: 'links',
    title: 'Website & API URLs',
    desc: 'Where the store and its backend run, per environment.',
    fields: [
      { key: 'prod', label: 'Production URL', type: 'url', required: true },
      { key: 'staging', label: 'Staging URL', type: 'url' },
      { key: 'admin', label: 'Admin panel URL', type: 'url' },
      { key: 'api', label: 'Backend API URL (production)', type: 'url' },
      { key: 'apiStaging', label: 'Backend API URL (staging)', type: 'url' },
      { key: 'repo', label: 'Code repository', type: 'text' }
    ]
  },
  {
    key: 'domain',
    title: 'Domain & SSL',
    desc: 'Where and when the domain was bought, when it expires, and the SSL certificate.',
    fields: [
      { key: 'name', label: 'Domain name', type: 'domain' },
      { key: 'registrar', label: 'Purchased from (registrar)', type: 'select', list: 'registrar' },
      { key: 'account', label: 'Registrar login (email / username)', type: 'text', vault: true },
      { key: 'password', label: 'Registrar password', type: 'secret' },
      { key: 'purchased', label: 'Purchase date', type: 'date' },
      { key: 'expiry', label: 'Domain expiry date', type: 'date' },
      { key: 'cost', label: 'Purchase cost (₹)', type: 'money' },
      { key: 'renewal', label: 'Renewal cost per year (₹)', type: 'money' },
      { key: 'auto', label: 'Auto-renew', type: 'select', options: ['Off', 'On'] },
      { key: 'dns', label: 'DNS managed at', type: 'text' },
      { key: 'sslProvider', label: 'SSL certificate', type: 'text' },
      { key: 'sslExpiry', label: 'SSL expiry date', type: 'date' },
      { key: 'sslCost', label: 'SSL cost per year (₹)', type: 'money' }
    ]
  },
  {
    key: 'hosting',
    title: 'Backend deployment & hosting',
    desc: 'Hosting platform, plan and what it costs.',
    fields: [
      { key: 'platform', label: 'Hosting platform', type: 'select', list: 'hosting' },
      { key: 'plan', label: 'Plan / instance', type: 'text' },
      { key: 'region', label: 'Region', type: 'text' },
      { key: 'ip', label: 'Server IP', type: 'text' },
      { key: 'account', label: 'Hosting login (email / username)', type: 'text', vault: true },
      { key: 'password', label: 'Hosting password', type: 'secret' },
      { key: 'cost', label: 'Hosting cost (₹)', type: 'money' },
      { key: 'cycle', label: 'Billing cycle', type: 'select', options: ['Monthly', 'Yearly'] },
      { key: 'nextBill', label: 'Next billing / renewal date', type: 'date' }
    ]
  },
  {
    key: 'db',
    title: 'Database',
    desc: 'Which database, and the access details needed to check tables.',
    fields: [
      { key: 'engine', label: 'Database', type: 'select', list: 'database' },
      { key: 'host', label: 'Host', type: 'text' },
      { key: 'port', label: 'Port', type: 'text' },
      { key: 'name', label: 'Database name', type: 'text' },
      { key: 'user', label: 'Username', type: 'text', vault: true },
      { key: 'password', label: 'Password / access key', type: 'secret' },
      { key: 'conn', label: 'Connection string', type: 'secret' },
      { key: 'console', label: 'DB console URL (to view tables)', type: 'url' },
      { key: 'backup', label: 'Backups', type: 'text' }
    ]
  },
  {
    key: 'keys',
    title: 'E-commerce keys & integrations',
    desc: 'Login, payment, shipping and tracking IDs used by the store.',
    fields: [
      { key: 'googleClientId', label: 'Google login — client ID', type: 'text', vault: true },
      { key: 'googleSecret', label: 'Google login — client secret', type: 'secret' },
      { key: 'payGateway', label: 'Payment gateway', type: 'select', list: 'payGateway' },
      { key: 'payKeyId', label: 'Payment key ID / merchant ID', type: 'text', vault: true },
      { key: 'paySecret', label: 'Payment secret key', type: 'secret' },
      { key: 'webhookSecret', label: 'Payment webhook secret', type: 'secret' },
      { key: 'shipping', label: 'Shipping provider', type: 'text' },
      { key: 'shippingKey', label: 'Shipping API key', type: 'secret' },
      { key: 'ga4', label: 'Google Analytics ID', type: 'text', vault: true },
      { key: 'pixel', label: 'Meta (Facebook) Pixel ID', type: 'text', vault: true },
      { key: 'smsKey', label: 'SMS / WhatsApp API key', type: 'secret' }
    ]
  }
] as const satisfies readonly SheetSectionDef[];

/** "section.field" keys of every secret field, e.g. "db.password". */
export const SECRET_FIELD_KEYS = [
  'domain.password',
  'hosting.password',
  'db.password',
  'db.conn',
  'keys.googleSecret',
  'keys.paySecret',
  'keys.webhookSecret',
  'keys.shippingKey',
  'keys.smsKey'
] as const;
export type SecretFieldKey = (typeof SECRET_FIELD_KEYS)[number];

const url = httpUrl.nullable();
const txt = optionalText(200);
const date = isoDate.nullable();
const money = paise.nullable();
/** Dropdown value from a Settings list — free text so removed list values stay valid on old records. */
const listValue = optionalText(80);

export const sheetLinksSchema = z.object({
  prod: httpUrl,
  staging: url,
  admin: url,
  api: url,
  apiStaging: url,
  repo: txt
});

export const sheetDomainSchema = z.object({
  name: domainName.nullable(),
  registrar: listValue,
  account: txt,
  purchased: date,
  expiry: date,
  cost: money,
  renewal: money,
  auto: z.enum(['Off', 'On']),
  dns: txt,
  sslProvider: txt,
  sslExpiry: date,
  sslCost: money
});

export const sheetHostingSchema = z.object({
  platform: listValue,
  plan: txt,
  region: txt,
  ip: txt,
  account: txt,
  cost: money,
  cycle: z.enum(BILLING_CYCLES).nullable(),
  nextBill: date
});

export const sheetDbSchema = z.object({
  engine: listValue,
  host: txt,
  port: optionalText(10),
  name: txt,
  user: txt,
  console: url,
  backup: optionalText(300)
});

export const sheetKeysSchema = z.object({
  googleClientId: txt,
  payGateway: listValue,
  payKeyId: txt,
  shipping: txt,
  ga4: txt,
  pixel: txt
});

const sectionSchemas = {
  links: sheetLinksSchema,
  domain: sheetDomainSchema,
  hosting: sheetHostingSchema,
  db: sheetDbSchema,
  keys: sheetKeysSchema
};

const checkDomainDates = (
  s: { domain?: { purchased?: string | null; expiry?: string | null } },
  ctx: z.RefinementCtx
) => {
  const { purchased, expiry } = s.domain ?? {};
  if (purchased && expiry && expiry <= purchased)
    ctx.addIssue({
      code: 'custom',
      path: ['domain', 'expiry'],
      message: 'Expiry must be after the purchase date.'
    });
};

/** The sheet as stored and returned (non-secret fields only). */
export const projectSheetSchema = z
  .object({
    projectId: id,
    ...sectionSchemas,
    notes: optionalText(4000),
    updatedAt: isoDateTime
  })
  .superRefine(checkDomainDates);

/** Saved together with a new project. */
export const projectSheetCreateSchema = z
  .object({ ...sectionSchemas, notes: optionalText(4000) })
  .superRefine(checkDomainDates);

/** Any section, any subset of its fields. */
export const projectSheetUpdateSchema = z
  .object({
    links: sheetLinksSchema.partial(),
    domain: sheetDomainSchema.partial(),
    hosting: sheetHostingSchema.partial(),
    db: sheetDbSchema.partial(),
    keys: sheetKeysSchema.partial(),
    notes: optionalText(4000)
  })
  .partial()
  .superRefine(checkDomainDates);

export type ProjectSheet = z.infer<typeof projectSheetSchema>;
export type ProjectSheetCreate = z.infer<typeof projectSheetCreateSchema>;
export type ProjectSheetUpdate = z.infer<typeof projectSheetUpdateSchema>;
export type SheetDomain = z.infer<typeof sheetDomainSchema>;
export type SheetHosting = z.infer<typeof sheetHostingSchema>;

/**
 * Sheet fields shown to roles without the full sheet (Accounts): cost amounts and due dates only.
 * The server blanks every other field; the client shows only these.
 */
export const COST_SHEET_FIELDS: Partial<Record<SheetSectionDef['key'], readonly string[]>> = {
  domain: ['purchased', 'expiry', 'cost', 'renewal', 'auto', 'sslExpiry', 'sslCost'],
  hosting: ['platform', 'cost', 'cycle', 'nextBill']
};
