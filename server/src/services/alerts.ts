/**
 * Alerts, computed live (prototype: alertsAll in selectors.js) from:
 *   - renewal items (domain / SSL / hosting / subscriptions) of active clients' live projects
 *   - unpaid issued invoices (due soon, or overdue)
 *   - manual notices (upcoming maintenance, other)
 *   - notification preferences: an alert shows once its date is within the LARGEST interval
 *     chosen for its type (or has passed). A type with no intervals is switched off.
 *
 * The alert id includes the due date, so after a renewal or a new due date it is a new alert
 * (read/dismissed state of the old one doesn't hide it).
 */
import {
  DAYS_AFTER_ALERT_TYPES,
  daysUntil,
  formatDate,
  formatInr,
  relativeDays,
  todayIso,
  type Alert,
  type AlertType,
  type InvoiceStatus,
  type IsoDate,
  type NoticeType,
  type NotificationPrefs,
  type RenewalItem,
  type RenewalKind
} from '@dsol/shared';

const RENEWAL_ALERT: Record<RenewalKind, AlertType> = {
  Domain: 'Domain expiration',
  SSL: 'SSL expiration',
  Hosting: 'Hosting renewals',
  Subscription: 'Subscription renewals'
};

const NOTICE_ALERT: Record<NoticeType, AlertType> = {
  'Upcoming maintenance': 'Upcoming maintenance',
  Other: 'Other notices'
};

export interface AlertInvoice {
  number: string;
  clientId: string;
  dueDate: IsoDate;
  status: InvoiceStatus;
  balancePaise: number;
}

export interface AlertNotice {
  id: string;
  title: string;
  body: string | null;
  date: IsoDate;
  type: NoticeType;
}

export interface AlertInput {
  renewals: readonly RenewalItem[];
  invoices: readonly AlertInvoice[];
  notices?: readonly AlertNotice[];
  prefs: NotificationPrefs;
  clientNames: Readonly<Record<string, string>>;
  /** alert ids this user has read / dismissed */
  read?: ReadonlySet<string>;
  dismissed?: ReadonlySet<string>;
  today?: IsoDate;
  /** Which channel's on/off switch applies: the inbox ('inApp') or the daily digest ('email'). Default: ignore channels. */
  channel?: 'inApp' | 'email';
  /** Roles without invoice access don't get invoice alerts. */
  includeInvoices?: boolean;
  /**
   * Roles that can't see project sheets (Accounts) get "Domain · <project>" instead of the domain
   * name and no provider — they see amounts and due dates only.
   */
  costsOnly?: boolean;
  /** Keep dismissed alerts in the result (flagged), for "Show dismissed". Default: leave them out. */
  includeDismissed?: boolean;
}

/** Largest reminder interval for a type, or null when the type is off. */
export const windowFor = (prefs: NotificationPrefs, type: AlertType) => {
  const days = prefs[type]?.days;
  return days && days.length ? Math.max(...days) : null;
};

export function buildAlerts(input: AlertInput): Alert[] {
  const today = input.today ?? todayIso();
  const name = (clientId: string) => input.clientNames[clientId] ?? '—';
  const on = (type: AlertType) => !input.channel || input.prefs[type]?.[input.channel] !== false;
  const out: Omit<Alert, 'read' | 'dismissed'>[] = [];

  for (const r of input.renewals) {
    const type = RENEWAL_ALERT[r.kind];
    const win = windowFor(input.prefs, type);
    if (win === null || !on(type) || r.daysLeft > win) continue;
    const verb = r.daysLeft < 0 ? 'expired' : r.kind === 'Domain' || r.kind === 'SSL' ? 'expires' : 'renews';
    const what = input.costsOnly ? `${r.kind} · ${r.projectName}` : r.name;
    out.push({
      id: `r:${r.id}:${r.expiry}`,
      type,
      title: `${what} ${verb} ${relativeDays(r.expiry, today)}`,
      body: [
        name(r.clientId),
        input.costsOnly ? r.kind : r.provider || r.kind,
        r.amountPaise ? formatInr(r.amountPaise) : null,
        r.kind === 'Domain' && !r.autoRenew ? 'auto-renew off' : null
      ]
        .filter(Boolean)
        .join(' · '),
      dueDate: r.expiry,
      daysLeft: r.daysLeft,
      tone: r.daysLeft <= 7 ? 'bad' : 'warn',
      href: `/projects/${r.projectId}`
    });
  }

  if (input.includeInvoices !== false)
    for (const v of input.invoices) {
      if (v.balancePaise <= 0 || v.status === 'Draft' || v.status === 'Void' || v.status === 'Paid') continue;
      const d = daysUntil(v.dueDate, today);
      const type: AlertType = d < 0 ? 'Overdue payments' : 'Invoice due dates';
      const win = windowFor(input.prefs, type);
      if (win === null || !on(type) || (d >= 0 && d > win)) continue;
      out.push({
        id: `i:${v.number}:${v.dueDate}`,
        type,
        title:
          d < 0
            ? `${v.number} is ${-d} ${d === -1 ? 'day' : 'days'} overdue`
            : `${v.number} due ${relativeDays(v.dueDate, today)}`,
        body: `${name(v.clientId)} · ${formatInr(v.balancePaise)} balance · due ${formatDate(v.dueDate)}`,
        dueDate: v.dueDate,
        daysLeft: d,
        tone: d < 0 ? 'bad' : 'warn',
        href: `/invoices/${encodeURIComponent(v.number)}`
      });
    }

  for (const n of input.notices ?? []) {
    const type = NOTICE_ALERT[n.type];
    const d = daysUntil(n.date, today);
    const win = windowFor(input.prefs, type);
    // a notice is about a future day: gone once the day has passed
    if (win === null || !on(type) || d < 0 || d > win) continue;
    out.push({
      id: `n:${n.id}:${n.date}`,
      type,
      title: n.title,
      body: [n.body, formatDate(n.date)].filter(Boolean).join(' · '),
      dueDate: n.date,
      daysLeft: d,
      tone: 'info',
      href: '/notifications'
    });
  }

  return out
    .map(a => ({
      ...a,
      read: input.read?.has(a.id) ?? false,
      dismissed: input.dismissed?.has(a.id) ?? false
    }))
    .filter(a => input.includeDismissed || !a.dismissed)
    .sort((a, b) => a.daysLeft - b.daysLeft || a.title.localeCompare(b.title));
}

/**
 * The reminder intervals this alert has reached: days before the date (or, for overdue payments,
 * days after the due date) that are now inside the interval. The digest mentions an alert once per
 * interval reached — so a date added late, or a day the job didn't run, still gets its reminder.
 */
export function reachedThresholds(
  alert: Pick<Alert, 'type' | 'daysLeft'>,
  prefs: NotificationPrefs
): number[] {
  const days = prefs[alert.type]?.days ?? [];
  return DAYS_AFTER_ALERT_TYPES.includes(alert.type)
    ? days.filter(d => -alert.daysLeft >= d)
    : days.filter(d => alert.daysLeft <= d);
}
