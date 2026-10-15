/**
 * D1 (SQLite) schema. Conventions:
 *   - ids are prefixed text ids (see ids.ts), e.g. "cl_V1StGXR8_Z5jdHi6B"
 *   - money is integer paise (₹1 = 100); columns end in _paise
 *   - dates are ISO text YYYY-MM-DD; timestamps are ISO datetime text (UTC)
 *   - derived values (invoice totals/status, work status, renewals, alerts) are NEVER stored
 *   - secrets exist only as AES-GCM ciphertext + iv (project_secrets, extra_keys)
 * Generate a migration after changing this file: npm run db:generate
 */
import type { CronRunCounts, NotificationPrefs } from '@dsol/shared';
import {
  AUDIT_ACTIONS,
  BILLING_CYCLES,
  BILLING_MODES,
  CLIENT_STATUSES,
  CONTACT_TAGS,
  EMAIL_KINDS,
  EMAIL_STATUSES,
  INVOICE_STORED_STATUSES,
  LIST_KEYS,
  NOTICE_TYPES,
  PAYMENT_METHODS,
  PROJECT_STATUSES,
  RELEASE_ITEM_KINDS,
  RELEASE_MAIL_STATUSES,
  RELEASE_STATUSES,
  RENEWAL_KINDS,
  USER_STATUSES,
  WORK_TYPES
} from '@dsol/shared';
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex
} from 'drizzle-orm/sqlite-core';

const nowSql = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;
const nowIso = () => new Date().toISOString();

/** Fresh builders per table (column builders must not be shared between tables). */
const timestamps = () => ({
  createdAt: text('created_at').notNull().default(nowSql),
  updatedAt: text('updated_at').notNull().default(nowSql).$onUpdateFn(nowIso)
});
const bool = (name: string) => integer(name, { mode: 'boolean' });

/* ------------------------------------------------------------------ people */

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    /** Cloudflare Access email, stored lower-case. */
    email: text('email').notNull(),
    name: text('name').notNull(),
    /** "Admin" or a custom role's name (roles.name). */
    role: text('role').notNull(),
    status: text('status', { enum: USER_STATUSES }).notNull().default('Invited'),
    lastLoginAt: text('last_login_at'),
    /** "pbkdf2-sha256$<iterations>$<salt b64>$<hash b64>" — null until the person sets a password. */
    passwordHash: text('password_hash'),
    passwordUpdatedAt: text('password_updated_at'),
    /** Failed sign-ins since the last success; at the limit the account locks for a while. */
    failedLogins: integer('failed_logins').notNull().default(0),
    lockedUntil: text('locked_until'),
    ...timestamps()
  },
  t => [uniqueIndex('users_email_unique').on(t.email)]
);

/**
 * Custom roles created by an Admin (Admin is built in and not stored). Users refer to a
 * role by name; renaming a role renames it on its users too.
 */
export const roles = sqliteTable(
  'roles',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    /** JSON array of permission keys (see PERMISSION_KEYS in shared) */
    permissions: text('permissions', { mode: 'json' }).$type<string[]>().notNull(),
    ...timestamps()
  },
  () => [uniqueIndex('roles_name_unique').on(sql`lower(name)`)]
);

/**
 * Signed-in sessions. The cookie carries a random token; only its SHA-256 is stored, so a database
 * copy can't be used to sign in.
 */
export const sessions = sqliteTable(
  'sessions',
  {
    /** SHA-256 of the session token (base64url) */
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: text('created_at').notNull().default(nowSql),
    /** sliding: moves forward with use, never past absoluteExpiresAt */
    expiresAt: text('expires_at').notNull(),
    absoluteExpiresAt: text('absolute_expires_at').notNull(),
    lastSeenAt: text('last_seen_at').notNull().default(nowSql),
    userAgent: text('user_agent')
  },
  t => [index('sessions_user_idx').on(t.userId), index('sessions_expires_idx').on(t.expiresAt)]
);

/** One-time links to set or reset a password (invites, "forgot password"). Only the hash is stored. */
export const passwordResets = sqliteTable(
  'password_resets',
  {
    /** SHA-256 of the token (base64url) */
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: text('purpose', { enum: ['invite', 'reset'] }).notNull(),
    expiresAt: text('expires_at').notNull(),
    usedAt: text('used_at'),
    createdAt: text('created_at').notNull().default(nowSql)
  },
  t => [index('password_resets_user_idx').on(t.userId)]
);

/* ----------------------------------------------------------------- clients */

/**
 * Client logos (PNG, JPG, WebP or SVG, at most 1 MB), base64 in the database — no separate file
 * storage needed. One row per client; deleted with the client.
 */
export const clientLogos = sqliteTable('client_logos', {
  clientId: text('client_id')
    .primaryKey()
    .references(() => clients.id, { onDelete: 'cascade' }),
  contentType: text('content_type').notNull(),
  data: text('data').notNull(),
  updatedAt: text('updated_at').notNull().default(nowSql).$onUpdateFn(nowIso)
});

export const clients = sqliteTable(
  'clients',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    color: text('color').notNull(),
    /** Version of the uploaded logo (its bytes are in client_logos); null = no logo. */
    logoKey: text('logo_key'),
    type: text('type'),
    industry: text('industry'),
    website: text('website').notNull(),
    since: text('since'),
    description: text('description'),
    addr1: text('addr1').notNull(),
    addr2: text('addr2'),
    city: text('city').notNull(),
    state: text('state'),
    pin: text('pin').notNull(),
    gstin: text('gstin'),
    currency: text('currency').notNull().default('INR'),
    paymentTerms: text('payment_terms').notNull().default('Net 15'),
    billingAddress: text('billing_address'),
    // social media (moved here from project_sheet by migration 0006)
    instagram: text('social_instagram'),
    facebook: text('social_facebook'),
    youtube: text('social_youtube'),
    socialOther: text('social_other'),
    notes: text('notes'),
    status: text('status', { enum: CLIENT_STATUSES }).notNull().default('Active'),
    archivedAt: text('archived_at'),
    ...timestamps()
  },
  t => [uniqueIndex('clients_name_unique').on(sql`lower(name)`), index('clients_status_idx').on(t.status)]
);

export const contacts = sqliteTable(
  'contacts',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    role: text('role'),
    email: text('email').notNull(),
    phone: text('phone'),
    altPhone: text('alt_phone'),
    tag: text('tag', { enum: CONTACT_TAGS }).notNull(),
    notifyReleases: bool('notify_releases').notNull().default(false),
    ...timestamps()
  },
  t => [
    index('contacts_client_idx').on(t.clientId),
    // one primary contact per client
    uniqueIndex('contacts_one_primary')
      .on(t.clientId)
      .where(sql`tag = 'Primary'`)
  ]
);

/* ---------------------------------------------------------------- projects */

export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    type: text('type'),
    status: text('status', { enum: PROJECT_STATUSES }).notNull().default('Active'),
    startDate: text('start_date'),
    stack: text('stack'),
    /** Environment codes, e.g. ["STG","PROD"]. */
    environments: text('environments', { mode: 'json' }).$type<string[]>().notNull(),
    archivedAt: text('archived_at'),
    ...timestamps()
  },
  t => [index('projects_client_idx').on(t.clientId), index('projects_status_idx').on(t.status)]
);

/**
 * One row per project, one column per NON-secret sheet field (see SHEET_SECTIONS in shared).
 * Column = section_field in snake case; money in paise. Secrets live in project_secrets.
 */
export const projectSheet = sqliteTable(
  'project_sheet',
  {
    projectId: text('project_id')
      .primaryKey()
      .references(() => projects.id, { onDelete: 'cascade' }),
    // links
    linksProd: text('links_prod').notNull(),
    linksStaging: text('links_staging'),
    linksDev: text('links_dev'), // no longer used (the Development / QA URL was removed)
    linksAdmin: text('links_admin'),
    linksApi: text('links_api'),
    linksApiStaging: text('links_api_staging'),
    linksRepo: text('links_repo'),
    // social: no longer used (moved to clients by migration 0006); kept so nothing is dropped
    socialInstagram: text('social_instagram'),
    socialFacebook: text('social_facebook'),
    socialYoutube: text('social_youtube'),
    socialOther: text('social_other'),
    // domain & SSL
    domainName: text('domain_name'),
    domainRegistrar: text('domain_registrar'),
    domainAccount: text('domain_account'),
    domainPurchased: text('domain_purchased'),
    domainExpiry: text('domain_expiry'),
    domainCostPaise: integer('domain_cost_paise'),
    domainRenewalPaise: integer('domain_renewal_paise'),
    domainAutoRenew: bool('domain_auto_renew').notNull().default(false),
    domainDns: text('domain_dns'),
    domainSslProvider: text('domain_ssl_provider'),
    domainSslExpiry: text('domain_ssl_expiry'),
    domainSslCostPaise: integer('domain_ssl_cost_paise'),
    // hosting
    hostingPlatform: text('hosting_platform'),
    hostingPlan: text('hosting_plan'),
    hostingRegion: text('hosting_region'),
    hostingIp: text('hosting_ip'),
    hostingAccount: text('hosting_account'),
    hostingCostPaise: integer('hosting_cost_paise'),
    hostingCycle: text('hosting_cycle', { enum: BILLING_CYCLES }),
    hostingNextBill: text('hosting_next_bill'),
    // database
    dbEngine: text('db_engine'),
    dbHost: text('db_host'),
    dbPort: text('db_port'),
    dbName: text('db_name'),
    dbUser: text('db_user'),
    dbConsole: text('db_console'),
    dbBackup: text('db_backup'),
    // e-commerce keys (non-secret IDs only)
    keysGoogleClientId: text('keys_google_client_id'),
    keysPayGateway: text('keys_pay_gateway'),
    keysPayKeyId: text('keys_pay_key_id'),
    keysShipping: text('keys_shipping'),
    keysGa4: text('keys_ga4'),
    keysPixel: text('keys_pixel'),
    notes: text('notes'),
    ...timestamps()
  },
  t => [
    index('project_sheet_domain_expiry_idx').on(t.domainExpiry),
    index('project_sheet_ssl_expiry_idx').on(t.domainSslExpiry),
    index('project_sheet_hosting_next_bill_idx').on(t.hostingNextBill),
    index('project_sheet_hosting_platform_idx').on(t.hostingPlatform)
  ]
);

/** Secret sheet fields, AES-256-GCM encrypted. There is deliberately no plaintext column. */
export const projectSecrets = sqliteTable(
  'project_secrets',
  {
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    /** "section.field", e.g. "db.password" (SECRET_FIELD_KEYS). */
    fieldKey: text('field_key').notNull(),
    /** base64 */
    ciphertext: text('ciphertext').notNull(),
    /** base64, 12 bytes, unique per encryption */
    iv: text('iv').notNull(),
    updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps()
  },
  t => [primaryKey({ columns: [t.projectId, t.fieldKey], name: 'project_secrets_pk' })]
);

/** "Other keys". Non-secret → value_plain; secret → ciphertext + iv (never both). */
export const extraKeys = sqliteTable(
  'extra_keys',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    isSecret: bool('is_secret').notNull().default(false),
    valuePlain: text('value_plain'),
    ciphertext: text('ciphertext'),
    iv: text('iv'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps()
  },
  t => [
    index('extra_keys_project_idx').on(t.projectId),
    check(
      'extra_keys_secret_storage',
      sql`(is_secret = 1 AND value_plain IS NULL AND ciphertext IS NOT NULL AND iv IS NOT NULL)
       OR (is_secret = 0 AND ciphertext IS NULL AND iv IS NULL)`
    )
  ]
);

export const projectCosts = sqliteTable(
  'project_costs',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    amountPaise: integer('amount_paise').notNull().default(0),
    cycle: text('cycle', { enum: BILLING_CYCLES }).notNull().default('Monthly'),
    nextDue: text('next_due'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps()
  },
  t => [index('project_costs_project_idx').on(t.projectId), index('project_costs_next_due_idx').on(t.nextDue)]
);

/* ---------------------------------------------------------------- releases */

export const releases = sqliteTable(
  'releases',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    version: text('version').notNull(),
    environment: text('environment').notNull(),
    releaseDate: text('release_date').notNull(),
    status: text('status', { enum: RELEASE_STATUSES }).notNull(),
    releasedBy: text('released_by').references(() => users.id, { onDelete: 'set null' }),
    mailStatus: text('mail_status', { enum: RELEASE_MAIL_STATUSES }).notNull().default('Not sent'),
    ...timestamps()
  },
  t => [index('releases_project_idx').on(t.projectId), index('releases_date_idx').on(t.releaseDate)]
);

export const releaseItems = sqliteTable(
  'release_items',
  {
    id: text('id').primaryKey(),
    releaseId: text('release_id')
      .notNull()
      .references(() => releases.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: RELEASE_ITEM_KINDS }).notNull(),
    text: text('text').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps()
  },
  t => [index('release_items_release_idx').on(t.releaseId)]
);

/* ----------------------------------------------------------------- billing */

export const invoices = sqliteTable(
  'invoices',
  {
    id: text('id').primaryKey(),
    number: text('number').notNull(),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'restrict' }),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
    issueDate: text('issue_date').notNull(),
    dueDate: text('due_date').notNull(),
    /** Only Draft / Sent / Void are stored; Paid, Partially paid and Overdue are derived. */
    status: text('status', { enum: INVOICE_STORED_STATUSES }).notNull().default('Draft'),
    discountPct: integer('discount_pct').notNull().default(0),
    gstRate: integer('gst_rate').notNull().default(18),
    notes: text('notes'),
    paymentInstructions: text('payment_instructions'),
    terms: text('terms'),
    ...timestamps()
  },
  t => [
    uniqueIndex('invoices_number_unique').on(t.number),
    index('invoices_client_idx').on(t.clientId),
    index('invoices_project_idx').on(t.projectId),
    index('invoices_due_idx').on(t.dueDate),
    check('invoices_gst_rate', sql`gst_rate IN (0, 5, 12, 18, 28)`),
    check('invoices_discount_pct', sql`discount_pct BETWEEN 0 AND 100`)
  ]
);

/** Delivered work. Billing status is derived from the linked invoice (never stored). */
export const workItems = sqliteTable(
  'work_items',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    releaseId: text('release_id').references(() => releases.id, { onDelete: 'set null' }),
    type: text('type', { enum: WORK_TYPES }).notNull(),
    title: text('title').notNull(),
    deliveredOn: text('delivered_on').notNull(),
    billing: text('billing', { enum: BILLING_MODES }).notNull(),
    amountPaise: integer('amount_paise').notNull().default(0),
    hours: real('hours').notNull().default(0),
    ratePaise: integer('rate_paise').notNull().default(0),
    /** The invoice it was billed on (may be a voided one — then it counts as "To bill"). */
    invoiceId: text('invoice_id').references(() => invoices.id, { onDelete: 'set null' }),
    note: text('note'),
    ...timestamps()
  },
  t => [
    index('work_items_project_idx').on(t.projectId),
    index('work_items_release_idx').on(t.releaseId),
    index('work_items_invoice_idx').on(t.invoiceId),
    check('work_items_amounts', sql`amount_paise >= 0 AND rate_paise >= 0 AND hours >= 0`)
  ]
);

export const invoiceLines = sqliteTable(
  'invoice_lines',
  {
    id: text('id').primaryKey(),
    invoiceId: text('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    quantity: real('quantity').notNull().default(1),
    unitPricePaise: integer('unit_price_paise').notNull().default(0),
    workItemId: text('work_item_id').references(() => workItems.id, { onDelete: 'set null' }),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps()
  },
  t => [
    index('invoice_lines_invoice_idx').on(t.invoiceId),
    index('invoice_lines_work_item_idx').on(t.workItemId),
    check('invoice_lines_amounts', sql`quantity >= 0 AND unit_price_paise >= 0`)
  ]
);

export const payments = sqliteTable(
  'payments',
  {
    id: text('id').primaryKey(),
    receiptNo: text('receipt_no').notNull(),
    invoiceId: text('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'restrict' }),
    paidOn: text('paid_on').notNull(),
    method: text('method', { enum: PAYMENT_METHODS }).notNull(),
    reference: text('reference').notNull(),
    amountPaise: integer('amount_paise').notNull(),
    note: text('note'),
    ...timestamps()
  },
  t => [
    uniqueIndex('payments_receipt_unique').on(t.receiptNo),
    index('payments_invoice_idx').on(t.invoiceId),
    index('payments_paid_on_idx').on(t.paidOn),
    check('payments_amount_positive', sql`amount_paise > 0`)
  ]
);

export const renewalHistory = sqliteTable(
  'renewal_history',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'restrict' }),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
    kind: text('kind', { enum: RENEWAL_KINDS }),
    itemName: text('item_name').notNull(),
    renewedOn: text('renewed_on').notNull(),
    amountPaise: integer('amount_paise').notNull().default(0),
    period: text('period').notNull(),
    renewedBy: text('renewed_by').notNull(),
    reference: text('reference'),
    paidVia: text('paid_via'),
    ...timestamps()
  },
  t => [
    index('renewal_history_client_idx').on(t.clientId),
    index('renewal_history_project_idx').on(t.projectId),
    index('renewal_history_date_idx').on(t.renewedOn)
  ]
);

/* ----------------------------------------------------------- communication */

export const emailTemplates = sqliteTable(
  'email_templates',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    subject: text('subject').notNull(),
    bodyHtml: text('body_html').notNull(),
    ...timestamps()
  },
  t => [uniqueIndex('email_templates_name_unique').on(t.name)]
);

export const emails = sqliteTable(
  'emails',
  {
    id: text('id').primaryKey(),
    /** null for internal emails (daily reminder digests to staff). */
    clientId: text('client_id').references(() => clients.id, { onDelete: 'restrict' }),
    kind: text('kind', { enum: EMAIL_KINDS }).notNull().default('client'),
    toAddresses: text('to_addresses', { mode: 'json' }).$type<string[]>().notNull(),
    ccAddresses: text('cc_addresses', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    toText: text('to_text').notNull(),
    /** to + cc — what Brevo counts against the daily limit. */
    recipientCount: integer('recipient_count').notNull().default(1),
    subject: text('subject').notNull(),
    templateName: text('template_name'),
    bodyHtml: text('body_html'),
    status: text('status', { enum: EMAIL_STATUSES }).notNull(),
    /** Sent at, or scheduled for (UTC). */
    sendAt: text('send_at'),
    releaseId: text('release_id').references(() => releases.id, { onDelete: 'set null' }),
    invoiceId: text('invoice_id').references(() => invoices.id, { onDelete: 'set null' }),
    paymentId: text('payment_id').references(() => payments.id, { onDelete: 'set null' }),
    attachmentCount: integer('attachment_count').notNull().default(0),
    /** Same key = same email: the daily cron uses it so a second run sends nothing new. */
    dedupeKey: text('dedupe_key'),
    sentBy: text('sent_by').references(() => users.id, { onDelete: 'set null' }),
    providerMessageId: text('provider_message_id'),
    error: text('error'),
    ...timestamps()
  },
  t => [
    index('emails_client_idx').on(t.clientId),
    index('emails_status_send_at_idx').on(t.status, t.sendAt),
    uniqueIndex('emails_dedupe_unique').on(t.dedupeKey),
    index('emails_send_at_idx').on(t.sendAt)
  ]
);

/** Manual notices (e.g. upcoming maintenance) shown as alerts until their date passes. */
export const notices = sqliteTable(
  'notices',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    body: text('body'),
    date: text('date').notNull(),
    type: text('type', { enum: NOTICE_TYPES }).notNull(),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps()
  },
  t => [index('notices_date_idx').on(t.date)]
);

/* ------------------------------------------------------------ admin & misc */

export const lists = sqliteTable(
  'lists',
  {
    id: text('id').primaryKey(),
    listKey: text('list_key', { enum: LIST_KEYS }).notNull(),
    value: text('value').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps()
  },
  t => [
    uniqueIndex('lists_key_value_unique').on(t.listKey, t.value),
    index('lists_key_order_idx').on(t.listKey, t.sortOrder)
  ]
);

/** Exactly one row (id = 1). */
export const settings = sqliteTable(
  'settings',
  {
    id: integer('id').primaryKey().default(1),
    company: text('company').notNull(),
    address: text('address'),
    gstin: text('gstin'),
    bank: text('bank'),
    upi: text('upi'),
    invoicePrefix: text('invoice_prefix').notNull(),
    nextInvoiceNo: integer('next_invoice_no').notNull().default(1),
    hourlyRatePaise: integer('hourly_rate_paise').notNull().default(0),
    /** Reminder intervals per alert type (Notifications → Preferences). */
    notificationPrefs: text('notification_prefs', { mode: 'json' }).$type<NotificationPrefs>().notNull(),
    emailFromName: text('email_from_name'),
    emailFromAddress: text('email_from_address'),
    /** Reminder days are counted in this time zone. */
    timezone: text('timezone').notNull().default('Asia/Kolkata'),
    /** Brevo free plan: 300 emails a day. Sending stops at this many recipients per day. */
    emailDailyLimit: integer('email_daily_limit').notNull().default(300),
    /** Email clients about overdue invoices from the daily cron (off by default). */
    clientOverdueReminders: bool('client_overdue_reminders').notNull().default(false),
    ...timestamps()
  },
  () => [check('settings_single_row', sql`id = 1`)]
);

/** Per-user read / dismissed state of computed alerts. */
export const alertState = sqliteTable(
  'alert_state',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    alertId: text('alert_id').notNull(),
    readAt: text('read_at'),
    dismissedAt: text('dismissed_at'),
    ...timestamps()
  },
  t => [primaryKey({ columns: [t.userId, t.alertId], name: 'alert_state_pk' })]
);

/** Append-only. `meta` must never contain secret values. */
export const auditLog = sqliteTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action', { enum: AUDIT_ACTIONS }).notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id').notNull(),
    meta: text('meta', { mode: 'json' }).$type<Record<string, unknown>>(),
    createdAt: text('created_at').notNull().default(nowSql)
  },
  t => [
    index('audit_log_entity_idx').on(t.entity, t.entityId),
    index('audit_log_user_idx').on(t.userId),
    index('audit_log_created_idx').on(t.createdAt),
    index('audit_log_action_created_idx').on(t.action, t.createdAt)
  ]
);

/** One row per daily-cron run (scheduled or started by hand). */
export const cronRuns = sqliteTable(
  'cron_runs',
  {
    id: text('id').primaryKey(),
    /** The day it ran for, in the reminder time zone. */
    runDate: text('run_date').notNull(),
    trigger: text('trigger', { enum: ['schedule', 'manual'] }).notNull(),
    startedAt: text('started_at').notNull(),
    finishedAt: text('finished_at'),
    counts: text('counts', { mode: 'json' }).$type<CronRunCounts>(),
    errors: text('errors', { mode: 'json' }).$type<string[]>()
  },
  t => [
    index('cron_runs_date_idx').on(t.runDate),
    index('cron_runs_trigger_started_idx').on(t.trigger, t.startedAt)
  ]
);

/**
 * Which reminder interval of which alert has been emailed to whom, so each one goes out once —
 * and an item that enters its window late (or a missed day) still gets its reminder.
 * recipient: "user:<userId>" for staff digests, "client:<clientId>" for client overdue reminders.
 */
export const reminderLog = sqliteTable(
  'reminder_log',
  {
    recipient: text('recipient').notNull(),
    alertId: text('alert_id').notNull(),
    /** the reminder interval in days (before, or after for overdue payments) */
    threshold: integer('threshold').notNull(),
    sentAt: text('sent_at').notNull().default(nowSql)
  },
  t => [primaryKey({ columns: [t.recipient, t.alertId, t.threshold], name: 'reminder_log_pk' })]
);
