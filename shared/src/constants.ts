/**
 * Fixed vocabularies shared by client and server.
 * Values users can edit (environments, hosting platforms, industries…) are NOT here:
 * they live in the `lists` table and are managed in Settings → Dropdown lists.
 */

/**
 * The built-in role: Admin, with every permission (see permissions.ts). Every other role is
 * created by an Admin on Team & Permissions → Role permissions and stored in the `roles` table.
 */
export const BUILTIN_ROLES = ['Admin'] as const;
export type BuiltinRole = (typeof BUILTIN_ROLES)[number];
/** A role name: "Admin", or the name of a custom role. */
export type Role = string;

export const USER_STATUSES = ['Active', 'Invited', 'Deactivated'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const CLIENT_STATUSES = ['Active', 'Inactive'] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const CONTACT_TAGS = ['Primary', 'Technical', 'Billing', 'Marketing'] as const;
export type ContactTag = (typeof CONTACT_TAGS)[number];

/** Archiving is not a status: archived projects have `archivedAt` set (soft delete). */
export const PROJECT_STATUSES = ['Planning', 'Active', 'Maintenance', 'Completed'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const RELEASE_STATUSES = ['Draft', 'Scheduled', 'In QA', 'Deployed', 'Failed', 'Rolled back'] as const;
export type ReleaseStatus = (typeof RELEASE_STATUSES)[number];

export const RELEASE_MAIL_STATUSES = ['Not sent', 'Scheduled', 'Sent'] as const;
export type ReleaseMailStatus = (typeof RELEASE_MAIL_STATUSES)[number];

/** The three lists on a release (one row per line in release_items). */
export const RELEASE_ITEM_KINDS = ['Feature', 'Bug fix', 'Known issue'] as const;
export type ReleaseItemKind = (typeof RELEASE_ITEM_KINDS)[number];

export const WORK_TYPES = ['Feature', 'Bug fix', 'Change request', 'Support'] as const;
export type WorkType = (typeof WORK_TYPES)[number];

/** Fixed → amount · Hourly → hours × rate · Free → not billable (warranty, goodwill). */
export const BILLING_MODES = ['Fixed', 'Hourly', 'Free'] as const;
export type BillingMode = (typeof BILLING_MODES)[number];

/** Derived (never stored) — see server/src/services/workStatus.ts */
export const WORK_STATUSES = [
  'Needs price',
  'To bill',
  'In draft',
  'Invoiced',
  'Overdue',
  'Part paid',
  'Paid',
  'Not billable'
] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];

/** Stored on the invoice: only Draft / Sent / Void. */
export const INVOICE_STORED_STATUSES = ['Draft', 'Sent', 'Void'] as const;
export type InvoiceStoredStatus = (typeof INVOICE_STORED_STATUSES)[number];

/** Derived (never stored) — see server/src/services/invoiceCalc.ts */
export const INVOICE_STATUSES = ['Draft', 'Sent', 'Partially paid', 'Paid', 'Overdue', 'Void'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const PAYMENT_METHODS = ['NEFT', 'RTGS', 'IMPS', 'UPI', 'Card', 'Cheque'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const GST_RATES = [0, 5, 12, 18, 28] as const;
export type GstRate = (typeof GST_RATES)[number];

export const BILLING_CYCLES = ['Monthly', 'Yearly'] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

/** "Logged (dev)": local development without a Brevo key — written to the console, not sent. */
export const EMAIL_STATUSES = ['Draft', 'Scheduled', 'Sent', 'Delivered', 'Failed', 'Logged (dev)'] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];

/** client: to a client's contacts · digest: daily reminder summary to staff · reminder: automatic overdue reminder to a client */
export const EMAIL_KINDS = ['client', 'digest', 'reminder', 'account'] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number];

/** Default Brevo free-plan limit (recipients per day). */
export const DEFAULT_EMAIL_DAILY_LIMIT = 300;

/**
 * Template variables, filled in when composing. Unknown ones (or ones with no value) stay visible
 * as {{name}} and are flagged in the preview.
 */
export const TEMPLATE_VARIABLES = {
  client_name: 'Client name',
  contact: 'Contact first name',
  project: 'Project name',
  version: 'Release version',
  release_notes: 'Release features and fixes',
  invoice_no: 'Invoice number',
  amount: 'Amount',
  due_date: 'Due date',
  receipt_no: 'Receipt number',
  domain: 'Domain',
  expiry: 'Expiry date',
  company: 'Your company name'
} as const;
export type TemplateVariable = keyof typeof TEMPLATE_VARIABLES;

export const NOTICE_TYPES = ['Upcoming maintenance', 'Other'] as const;
export type NoticeType = (typeof NOTICE_TYPES)[number];

export const RENEWAL_KINDS = ['Domain', 'SSL', 'Hosting', 'Subscription'] as const;
export type RenewalKind = (typeof RENEWAL_KINDS)[number];

export const DUE_STATUSES = ['Active', 'Expiring soon', 'Expired'] as const;
export type DueStatus = (typeof DUE_STATUSES)[number];

/** A due date within this many days is "Expiring soon". */
export const EXPIRING_SOON_DAYS = 30;

export const ALERT_TYPES = [
  'Domain expiration',
  'SSL expiration',
  'Hosting renewals',
  'Subscription renewals',
  'Invoice due dates',
  'Overdue payments',
  'Upcoming maintenance',
  'Other notices'
] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

/** Reminder intervals offered in Notifications → Preferences (days). */
export const REMINDER_DAY_OPTIONS = [60, 30, 14, 7, 3, 2, 1] as const;

/** Defaults from the prototype (days before; for overdue payments, days after). */
export const DEFAULT_REMINDER_DAYS: Record<AlertType, number[]> = {
  'Domain expiration': [30, 7, 1],
  'SSL expiration': [30, 14, 7],
  'Hosting renewals': [14, 7],
  'Subscription renewals': [14, 7],
  'Invoice due dates': [7, 1],
  'Overdue payments': [1, 7, 14],
  'Upcoming maintenance': [2, 1],
  'Other notices': [7, 1]
};

export interface AlertTypePrefs {
  /** Reminder days; empty = this type is off. */
  days: number[];
  /** Include in the daily digest email. */
  email: boolean;
  /** Show in the bell and Notifications inbox. */
  inApp: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS = Object.fromEntries(
  Object.entries(DEFAULT_REMINDER_DAYS).map(([k, days]) => [k, { days, email: true, inApp: true }])
) as Record<AlertType, AlertTypePrefs>;

/** Alert types about invoices — the only ones Accounts users are emailed about. */
export const INVOICE_ALERT_TYPES: readonly AlertType[] = ['Invoice due dates', 'Overdue payments'];

/** Overdue payments count days AFTER the due date; every other type counts days before. */
export const DAYS_AFTER_ALERT_TYPES: readonly AlertType[] = ['Overdue payments'];

/** Keys of the editable dropdown lists (Settings → Dropdown lists). */
export const LIST_KEYS = [
  'environments',
  'hosting',
  'registrar',
  'database',
  'payGateway',
  'projectType',
  'businessType',
  'industry',
  'state'
] as const;
export type ListKey = (typeof LIST_KEYS)[number];

/** Friendly names for well-known environment codes; other codes show as typed. */
export const ENV_NAMES: Record<string, string> = {
  DEV: 'Development',
  QA: 'QA',
  STG: 'Staging',
  PROD: 'Production',
  UAT: 'User acceptance'
};

/** Audit log actions. Format: entity.verb. */
export const AUDIT_ACTIONS = [
  'secret.reveal',
  'secret.update',
  'secret.delete',
  'invoice.issue',
  'invoice.void',
  'payment.record',
  'user.invite',
  'user.role_change',
  'role.create',
  'role.update',
  'role.delete',
  'user.deactivate',
  'user.reactivate',
  'settings.update',
  'list.add',
  'list.remove',
  'renewal.renew',
  'email.send',
  'cron.run',
  'client.deactivate',
  'client.archive',
  'client.restore',
  'client.delete',
  'data.export',
  'auth.login',
  'auth.login_failed',
  'auth.locked',
  'auth.logout',
  'auth.password_change',
  'auth.password_reset_requested',
  'auth.password_reset'
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
