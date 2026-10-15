/**
 * Everything with a due date, read live from the project sheets (prototype: renewalsAll / renewEntry / annualCost):
 *
 *   Domain        domain.expiry          SSL           domain.sslExpiry
 *   Hosting       hosting.nextBill       Subscription  project_costs.next_due
 *
 * Archived projects are left out. Nothing here is stored.
 */
import {
  addMonths,
  daysUntil,
  EXPIRING_SOON_DAYS,
  todayIso,
  type BillingCycle,
  type DueStatus,
  type IsoDate,
  type RenewalItem
} from '@dsol/shared';

/** The sheet fields renewals need (a subset of ProjectSheet; money in paise). */
export interface RenewalSheet {
  domain: {
    name: string | null;
    registrar: string | null;
    expiry: IsoDate | null;
    cost: number | null;
    renewal: number | null;
    auto: 'On' | 'Off';
    sslProvider: string | null;
    sslExpiry: IsoDate | null;
    sslCost: number | null;
  };
  hosting: {
    platform: string | null;
    plan: string | null;
    cost: number | null;
    cycle: BillingCycle | null;
    nextBill: IsoDate | null;
  };
}

export interface RenewalCost {
  id: string;
  name: string;
  amountPaise: number;
  cycle: BillingCycle;
  nextDue: IsoDate | null;
}

export interface RenewalProject {
  id: string;
  clientId: string;
  name: string;
  archivedAt: string | null;
  sheet: RenewalSheet;
  costs: readonly RenewalCost[];
}

export function dueStatus(daysLeft: number): DueStatus {
  if (daysLeft < 0) return 'Expired';
  return daysLeft <= EXPIRING_SOON_DAYS ? 'Expiring soon' : 'Active';
}

/** ₹ per year for an amount billed monthly or yearly. */
export const yearlyPaise = (amountPaise: number | null, cycle: BillingCycle | null) =>
  (amountPaise ?? 0) * (cycle === 'Monthly' ? 12 : 1);

/** Yearly running cost of a project: domain (renewal price, else purchase price) + SSL + hosting + other costs. */
export function annualCostPaise(sheet: RenewalSheet, costs: readonly RenewalCost[]): number {
  return (
    (sheet.domain.renewal || sheet.domain.cost || 0) +
    (sheet.domain.sslCost ?? 0) +
    yearlyPaise(sheet.hosting.cost, sheet.hosting.cycle ?? 'Monthly') +
    costs.reduce((sum, c) => sum + yearlyPaise(c.amountPaise, c.cycle), 0)
  );
}

export function renewalItems(
  projects: readonly RenewalProject[],
  today: IsoDate = todayIso()
): RenewalItem[] {
  const out: Omit<RenewalItem, 'daysLeft' | 'status'>[] = [];
  for (const p of projects) {
    if (p.archivedAt) continue;
    const { domain, hosting } = p.sheet;
    const base = { projectId: p.id, clientId: p.clientId, projectName: p.name };
    if (domain.name && domain.expiry)
      out.push({
        ...base,
        id: `${p.id}:domain`,
        ref: 'domain',
        kind: 'Domain',
        name: domain.name,
        provider: domain.registrar,
        expiry: domain.expiry,
        amountPaise: domain.renewal || domain.cost || 0,
        cycle: 'Yearly',
        autoRenew: domain.auto === 'On'
      });
    if (domain.sslExpiry)
      out.push({
        ...base,
        id: `${p.id}:ssl`,
        ref: 'ssl',
        kind: 'SSL',
        name: 'SSL · ' + (domain.name || p.name),
        provider: domain.sslProvider,
        expiry: domain.sslExpiry,
        amountPaise: domain.sslCost ?? 0,
        cycle: 'Yearly',
        autoRenew: null
      });
    if (hosting.nextBill)
      out.push({
        ...base,
        id: `${p.id}:hosting`,
        ref: 'hosting',
        kind: 'Hosting',
        name: (hosting.platform || 'Hosting') + (hosting.plan ? ' — ' + hosting.plan : ''),
        provider: hosting.platform,
        expiry: hosting.nextBill,
        amountPaise: hosting.cost ?? 0,
        cycle: hosting.cycle ?? 'Monthly',
        autoRenew: null
      });
    for (const c of p.costs)
      if (c.nextDue)
        out.push({
          ...base,
          id: `${p.id}:cost:${c.id}`,
          ref: `cost:${c.id}`,
          kind: 'Subscription',
          name: c.name,
          provider: null,
          expiry: c.nextDue,
          amountPaise: c.amountPaise,
          cycle: c.cycle,
          autoRenew: null
        });
  }
  return out.map(r => {
    const daysLeft = daysUntil(r.expiry, today);
    return { ...r, daysLeft, status: dueStatus(daysLeft) };
  });
}

/** Which sheet field a renewal moves, and to what date. */
export type RenewalChange =
  | { field: 'domain.expiry' | 'domain.sslExpiry' | 'hosting.nextBill'; newDate: IsoDate }
  | { field: 'cost.nextDue'; costId: string; newDate: IsoDate };

/**
 * Renew for `periods` periods: months for monthly items, years for yearly ones.
 * Month ends are clamped (31 Jan + 1 month → 28/29 Feb).
 */
export function renewEntry(
  item: Pick<RenewalItem, 'ref' | 'expiry' | 'cycle'>,
  periods: number
): RenewalChange {
  if (!Number.isInteger(periods) || periods < 1) throw new Error('Renew for at least one period.');
  const newDate = addMonths(item.expiry, item.cycle === 'Monthly' ? periods : 12 * periods);
  if (item.ref === 'domain') return { field: 'domain.expiry', newDate };
  if (item.ref === 'ssl') return { field: 'domain.sslExpiry', newDate };
  if (item.ref === 'hosting') return { field: 'hosting.nextBill', newDate };
  if (item.ref.startsWith('cost:')) return { field: 'cost.nextDue', costId: item.ref.slice(5), newDate };
  throw new Error('Unknown renewal: ' + item.ref);
}
