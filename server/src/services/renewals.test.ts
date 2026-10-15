import { describe, expect, it } from 'vitest';
import {
  annualCostPaise,
  dueStatus,
  renewalItems,
  renewEntry,
  type RenewalProject,
  type RenewalSheet
} from './renewals';

const TODAY = '2026-10-12';

const sheet = (
  over: { domain?: Partial<RenewalSheet['domain']>; hosting?: Partial<RenewalSheet['hosting']> } = {}
): RenewalSheet => ({
  domain: {
    name: 'kaverinaturals.in',
    registrar: 'GoDaddy',
    expiry: '2026-10-22',
    cost: 799_00,
    renewal: 899_00,
    auto: 'Off',
    sslProvider: 'Sectigo',
    sslExpiry: '2026-10-22',
    sslCost: 8_900_00,
    ...over.domain
  },
  hosting: {
    platform: 'Vercel',
    plan: 'Pro',
    cost: 5_040_00,
    cycle: 'Monthly',
    nextBill: '2026-11-14',
    ...over.hosting
  }
});

const project = (over: Partial<RenewalProject> = {}): RenewalProject => ({
  id: 'pj_p1',
  clientId: 'cl_kaveri',
  name: 'Kaveri Storefront',
  archivedAt: null,
  sheet: sheet(),
  costs: [
    { id: 'pc_1', name: 'Cloudflare Pro', amountPaise: 1_700_00, cycle: 'Monthly', nextDue: '2026-10-28' }
  ],
  ...over
});

describe('renewalItems', () => {
  it('lists domain, SSL, hosting and recurring costs with days left and status', () => {
    const items = renewalItems([project()], TODAY);
    expect(items.map(i => [i.kind, i.ref, i.daysLeft, i.status])).toEqual([
      ['Domain', 'domain', 10, 'Expiring soon'],
      ['SSL', 'ssl', 10, 'Expiring soon'],
      ['Hosting', 'hosting', 33, 'Active'],
      ['Subscription', 'cost:pc_1', 16, 'Expiring soon']
    ]);
    const domain = items[0]!;
    expect(domain.amountPaise).toBe(899_00); // renewal price
    expect(domain.autoRenew).toBe(false);
    expect(items[2]!.name).toBe('Vercel — Pro');
  });

  it('uses the purchase price when there is no renewal price', () => {
    const [d] = renewalItems([project({ sheet: sheet({ domain: { renewal: null } }) })], TODAY);
    expect(d!.amountPaise).toBe(799_00);
  });

  it('marks past dates Expired and skips empty dates and archived projects', () => {
    const p = project({
      sheet: sheet({ domain: { expiry: '2026-09-30', sslExpiry: null }, hosting: { nextBill: null } }),
      costs: [{ id: 'pc_x', name: 'Unscheduled', amountPaise: 1, cycle: 'Yearly', nextDue: null }]
    });
    const items = renewalItems([p, project({ id: 'pj_old', archivedAt: '2026-05-30T00:00:00Z' })], TODAY);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'Domain', daysLeft: -12, status: 'Expired' });
  });

  it('needs a domain name for a domain item', () => {
    const items = renewalItems([project({ sheet: sheet({ domain: { name: null } }) })], TODAY);
    expect(items.some(i => i.kind === 'Domain')).toBe(false);
  });
});

describe('dueStatus', () => {
  it('uses a 30-day window', () => {
    expect(dueStatus(-1)).toBe('Expired');
    expect(dueStatus(0)).toBe('Expiring soon');
    expect(dueStatus(30)).toBe('Expiring soon');
    expect(dueStatus(31)).toBe('Active');
  });
});

describe('renewEntry', () => {
  it('moves yearly items by years and monthly items by months', () => {
    expect(renewEntry({ ref: 'domain', expiry: '2026-10-22', cycle: 'Yearly' }, 2)).toEqual({
      field: 'domain.expiry',
      newDate: '2028-10-22'
    });
    expect(renewEntry({ ref: 'ssl', expiry: '2026-10-22', cycle: 'Yearly' }, 1)).toEqual({
      field: 'domain.sslExpiry',
      newDate: '2027-10-22'
    });
    expect(renewEntry({ ref: 'hosting', expiry: '2026-11-14', cycle: 'Monthly' }, 3)).toEqual({
      field: 'hosting.nextBill',
      newDate: '2027-02-14'
    });
    expect(renewEntry({ ref: 'cost:pc_1', expiry: '2026-10-28', cycle: 'Monthly' }, 1)).toEqual({
      field: 'cost.nextDue',
      costId: 'pc_1',
      newDate: '2026-11-28'
    });
  });

  it('clamps month ends instead of rolling into the next month', () => {
    expect(renewEntry({ ref: 'hosting', expiry: '2026-01-31', cycle: 'Monthly' }, 1).newDate).toBe(
      '2026-02-28'
    );
    expect(renewEntry({ ref: 'hosting', expiry: '2028-01-31', cycle: 'Monthly' }, 1).newDate).toBe(
      '2028-02-29'
    );
    expect(renewEntry({ ref: 'domain', expiry: '2028-02-29', cycle: 'Yearly' }, 1).newDate).toBe(
      '2029-02-28'
    );
  });

  it('rejects a renewal of less than one period', () => {
    expect(() => renewEntry({ ref: 'domain', expiry: '2026-10-22', cycle: 'Yearly' }, 0)).toThrow();
  });
});

describe('annualCostPaise', () => {
  it('adds domain renewal, SSL, hosting and other costs per year', () => {
    const p = project();
    // 899 + 8,900 + 5,040 × 12 + 1,700 × 12
    expect(annualCostPaise(p.sheet, p.costs)).toBe(899_00 + 8_900_00 + 60_480_00 + 20_400_00);
  });

  it('counts yearly hosting once and treats missing values as zero', () => {
    const s = sheet({
      domain: { renewal: null, cost: null, sslCost: null },
      hosting: { cost: 54_000_00, cycle: 'Yearly' }
    });
    expect(annualCostPaise(s, [])).toBe(54_000_00);
  });
});
