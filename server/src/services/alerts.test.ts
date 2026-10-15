import { DEFAULT_NOTIFICATION_PREFS, type NotificationPrefs, type RenewalItem } from '@dsol/shared';
import { describe, expect, it } from 'vitest';
import { buildAlerts, reachedThresholds, type AlertInvoice } from './alerts';

const TODAY = '2026-10-12';
const renewal = (over: Partial<RenewalItem>): RenewalItem => ({
  id: 'pj_p1:domain',
  projectId: 'pj_p1',
  clientId: 'cl_kaveri',
  projectName: 'Kaveri Storefront',
  ref: 'domain',
  kind: 'Domain',
  name: 'kaverinaturals.in',
  provider: 'GoDaddy',
  expiry: '2026-10-22',
  amountPaise: 899_00,
  cycle: 'Yearly',
  autoRenew: false,
  daysLeft: 10,
  status: 'Expiring soon',
  ...over
});
const invoice = (over: Partial<AlertInvoice>): AlertInvoice => ({
  number: 'INV-2026-0145',
  clientId: 'cl_urbanloom',
  dueDate: '2026-10-15',
  status: 'Partially paid',
  balancePaise: 46_760_00,
  ...over
});
const clientNames = { cl_kaveri: 'Kaveri Naturals', cl_urbanloom: 'UrbanLoom Apparel' };
const run = (over: Partial<Parameters<typeof buildAlerts>[0]> = {}) =>
  buildAlerts({
    renewals: [],
    invoices: [],
    prefs: DEFAULT_NOTIFICATION_PREFS,
    clientNames,
    today: TODAY,
    ...over
  });

describe('buildAlerts', () => {
  it('raises a renewal alert inside the largest reminder interval', () => {
    const [a] = run({ renewals: [renewal({})] });
    expect(a).toMatchObject({
      id: 'r:pj_p1:domain:2026-10-22',
      type: 'Domain expiration',
      title: 'kaverinaturals.in expires in 10 days',
      body: 'Kaveri Naturals · GoDaddy · ₹899 · auto-renew off',
      tone: 'warn',
      href: '/projects/pj_p1',
      read: false
    });
  });

  it('stays quiet outside the window and when a type is switched off', () => {
    expect(run({ renewals: [renewal({ daysLeft: 31 })] })).toHaveLength(0); // domain window is 30
    const off: NotificationPrefs = {
      ...DEFAULT_NOTIFICATION_PREFS,
      'Domain expiration': { days: [], email: true, inApp: true }
    };
    expect(run({ renewals: [renewal({})], prefs: off })).toHaveLength(0);
  });

  it('flags items within 7 days, and expired ones, as urgent', () => {
    const [soon] = run({ renewals: [renewal({ daysLeft: 7, expiry: '2026-10-19' })] });
    expect(soon!.tone).toBe('bad');
    const [gone] = run({ renewals: [renewal({ daysLeft: -12, expiry: '2026-09-30', status: 'Expired' })] });
    expect(gone!.title).toBe('kaverinaturals.in expired 12 days ago');
  });

  it('uses "renews" for hosting and subscriptions', () => {
    const [a] = run({
      renewals: [
        renewal({
          kind: 'Hosting',
          name: 'Railway — Starter',
          daysLeft: 8,
          expiry: '2026-10-20',
          autoRenew: null
        })
      ]
    });
    expect(a!.title).toBe('Railway — Starter renews in 8 days');
    expect(a!.type).toBe('Hosting renewals');
  });

  it('raises invoice-due and overdue alerts, but not for drafts, voids or paid invoices', () => {
    const alerts = run({
      invoices: [
        invoice({}),
        invoice({ number: 'INV-2026-0142', dueDate: '2026-09-30', status: 'Overdue', balancePaise: 10 }),
        invoice({ number: 'INV-D', status: 'Draft' }),
        invoice({ number: 'INV-V', status: 'Void' }),
        invoice({ number: 'INV-P', status: 'Paid', balancePaise: 0 }),
        invoice({ number: 'INV-FAR', dueDate: '2026-10-30', status: 'Sent' }) // 18 days: outside the 7-day window
      ]
    });
    expect(alerts.map(a => [a.type, a.title])).toEqual([
      ['Overdue payments', 'INV-2026-0142 is 12 days overdue'],
      ['Invoice due dates', 'INV-2026-0145 due in 3 days']
    ]);
    expect(alerts[1]!.href).toBe('/invoices/INV-2026-0145');
  });

  it('hides dismissed alerts, marks read ones and sorts by urgency', () => {
    const alerts = run({
      renewals: [
        renewal({}),
        renewal({
          id: 'pj_p1:ssl',
          kind: 'SSL',
          name: 'SSL · kaverinaturals.in',
          daysLeft: 2,
          expiry: '2026-10-14'
        })
      ],
      invoices: [invoice({})],
      dismissed: new Set(['r:pj_p1:domain:2026-10-22']),
      read: new Set(['i:INV-2026-0145:2026-10-15'])
    });
    expect(alerts.map(a => [a.id, a.read])).toEqual([
      ['r:pj_p1:ssl:2026-10-14', false],
      ['i:INV-2026-0145:2026-10-15', true]
    ]);
  });

  it('treats a renewed item (new due date) as a new alert', () => {
    const dismissed = new Set(['r:pj_p1:domain:2026-10-22']);
    expect(run({ renewals: [renewal({})], dismissed })).toHaveLength(0);
    expect(run({ renewals: [renewal({ expiry: '2026-11-05', daysLeft: 24 })], dismissed })).toHaveLength(1);
  });
});

describe('alert windows, channels and notices', () => {
  const prefs = (
    type: keyof NotificationPrefs,
    over: Partial<NotificationPrefs[typeof type]>
  ): NotificationPrefs => ({
    ...DEFAULT_NOTIFICATION_PREFS,
    [type]: { ...DEFAULT_NOTIFICATION_PREFS[type], ...over }
  });

  it('uses the largest selected interval as the window', () => {
    const p = prefs('Domain expiration', { days: [7, 60] });
    expect(run({ renewals: [renewal({ daysLeft: 45, expiry: '2026-11-26' })], prefs: p })).toHaveLength(1);
    expect(run({ renewals: [renewal({ daysLeft: 61, expiry: '2026-12-12' })], prefs: p })).toHaveLength(0);
  });

  it('respects the in-app and email channel switches', () => {
    const p = prefs('Domain expiration', { inApp: false });
    expect(run({ renewals: [renewal({})], prefs: p, channel: 'inApp' })).toHaveLength(0);
    expect(run({ renewals: [renewal({})], prefs: p, channel: 'email' })).toHaveLength(1);
  });

  it('shows notices inside their window until the day passes', () => {
    const notice = {
      id: 'nt_1',
      title: 'Kaveri maintenance window',
      body: '1:00–2:00 AM IST',
      date: '2026-10-13',
      type: 'Upcoming maintenance' as const
    };
    expect(run({ notices: [notice] })[0]).toMatchObject({
      id: 'n:nt_1:2026-10-13',
      type: 'Upcoming maintenance',
      tone: 'info',
      daysLeft: 1
    });
    expect(run({ notices: [{ ...notice, date: '2026-10-11' }] })).toHaveLength(0); // passed
    expect(run({ notices: [{ ...notice, date: '2026-10-20' }] })).toHaveLength(0); // window is 2 days
  });

  it('hides invoice alerts from roles without invoice access, and names from Accounts', () => {
    expect(run({ invoices: [invoice({})], includeInvoices: false })).toHaveLength(0);
    const [a] = run({ renewals: [renewal({})], costsOnly: true });
    expect(a!.title).toBe('Domain · Kaveri Storefront expires in 10 days');
    expect(a!.body).not.toContain('GoDaddy');
  });

  it('lists the reminder intervals reached: days before, or days after the due date for overdue payments', () => {
    const p = DEFAULT_NOTIFICATION_PREFS; // domain [30, 7, 1], overdue [1, 7, 14] (after)
    expect(reachedThresholds({ type: 'Domain expiration', daysLeft: 5 }, p)).toEqual([30, 7]);
    expect(reachedThresholds({ type: 'Domain expiration', daysLeft: 45 }, p)).toEqual([]);
    expect(reachedThresholds({ type: 'Domain expiration', daysLeft: -3 }, p)).toEqual([30, 7, 1]);
    expect(reachedThresholds({ type: 'Overdue payments', daysLeft: -8 }, p)).toEqual([1, 7]);
    expect(reachedThresholds({ type: 'Overdue payments', daysLeft: 2 }, p)).toEqual([]);
  });
});
