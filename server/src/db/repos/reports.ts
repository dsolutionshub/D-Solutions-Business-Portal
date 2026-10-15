/**
 * Reports, all computed from stored records (no ratios or demo figures):
 *   monthly      invoiced (issued, not void, by invoice date) vs collected (payments, by payment date)
 *   ageing       open balances of issued invoices by days since the invoice date
 *   clients      invoiced and collected in the range, per client
 *   workTypes    delivered work billed on issued invoices dated in the range, per work type
 *   runningCosts yearly domain + SSL + hosting + recurring costs per live project
 *   renewals     renewals due in the next 90 days, by month
 *   unbilled     work not invoiced yet (To bill, Needs price, In draft)
 */
import {
  addDays,
  AGEING_BUCKETS,
  daysUntil,
  monthLabel,
  paiseToRupees,
  todayIso,
  WORK_TYPES,
  type IsoDate,
  type ReportKey,
  type ReportRange,
  type Reports
} from '@dsol/shared';
import { and, eq, gte, lte } from 'drizzle-orm';
import { annualCostPaise, renewalItems } from '../../services/renewals';
import type { Db } from '../client';
import { clients as clientsTable, invoices, payments } from '../schema';
import { loadInvoices, loadPayments, loadWork } from './billing';
import { loadRenewalProjects } from './renewals';

const ym = (iso: IsoDate) => iso.slice(0, 7);

/** The months a range covers, oldest first ("2026-05" …), ending with the current month. */
export function rangeMonths(range: ReportRange, today: IsoDate = todayIso()): string[] {
  const [y, m] = today.split('-').map(Number) as [number, number];
  // FY to date: the Indian financial year starts in April
  const count = range === '6M' ? 6 : range === '12M' ? 12 : ((m - 4 + 12) % 12) + 1;
  return Array.from({ length: count }, (_, i) => {
    const idx = y * 12 + (m - 1) - (count - 1 - i);
    return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
  });
}

export async function buildReports(
  db: Db,
  range: ReportRange,
  clientId?: string,
  today: IsoDate = todayIso()
): Promise<Reports> {
  const months = rangeMonths(range, today);
  const from = months[0] + '-01';
  const to = today;
  const forClient = clientId ? eq(invoices.clientId, clientId) : undefined;

  const [allIssued, pays, work, projects, clientRows] = await Promise.all([
    loadInvoices(db, and(eq(invoices.status, 'Sent'), forClient), today),
    loadPayments(
      db,
      and(
        gte(payments.paidOn, from),
        lte(payments.paidOn, to),
        clientId ? eq(invoices.clientId, clientId) : undefined
      )
    ),
    loadWork(db, undefined, today),
    loadRenewalProjects(db),
    db.select({ id: clientsTable.id, name: clientsTable.name }).from(clientsTable)
  ]);
  const inRange = allIssued.filter(v => v.issueDate >= from && v.issueDate <= to);

  // monthly
  const monthly = months.map(month => ({
    month,
    invoicedPaise: inRange.filter(v => ym(v.issueDate) === month).reduce((a, v) => a + v.totalPaise, 0),
    collectedPaise: pays.filter(p => ym(p.paidOn) === month).reduce((a, p) => a + p.amountPaise, 0)
  }));

  // ageing (as of today, every open balance)
  const ageing = AGEING_BUCKETS.map(bucket => ({ bucket, balancePaise: 0, count: 0 }));
  for (const v of allIssued) {
    if (v.balancePaise <= 0) continue;
    const age = -daysUntil(v.issueDate, today);
    const b = ageing[age <= 30 ? 0 : age <= 60 ? 1 : age <= 90 ? 2 : 3]!;
    b.balancePaise += v.balancePaise;
    b.count++;
  }

  // clients
  const byClient = new Map<string, Reports['clients'][number]>();
  const clientRow = (id: string, name: string) => {
    let r = byClient.get(id);
    if (!r) byClient.set(id, (r = { clientId: id, clientName: name, invoicedPaise: 0, collectedPaise: 0 }));
    return r;
  };
  for (const v of inRange) clientRow(v.clientId, v.clientName).invoicedPaise += v.taxablePaise;
  for (const p of pays) clientRow(p.clientId, p.clientName).collectedPaise += p.amountPaise;
  const clients = [...byClient.values()].sort(
    (a, b) => b.invoicedPaise - a.invoicedPaise || b.collectedPaise - a.collectedPaise
  );

  // billed work by type
  const billedNos = new Set(inRange.map(v => v.number));
  const clientWork = clientId ? work.filter(w => w.clientId === clientId) : work;
  const workTypes = WORK_TYPES.map(type => {
    const list = clientWork.filter(w => w.type === type && w.invoiceNo && billedNos.has(w.invoiceNo));
    return { type, billedPaise: list.reduce((a, w) => a + w.billablePaise, 0), count: list.length };
  });

  // running costs per live project
  const liveProjects = clientId ? projects.filter(p => p.clientId === clientId) : projects;
  const clientNames = new Map(clientRows.map(c => [c.id, c.name]));
  const runningCosts = liveProjects
    .map(p => ({
      projectId: p.id,
      projectName: p.name,
      clientName: clientNames.get(p.clientId) ?? '',
      clientId: p.clientId,
      yearlyPaise: annualCostPaise(p.sheet, p.costs)
    }))
    .filter(p => p.yearlyPaise > 0)
    .sort((a, b) => b.yearlyPaise - a.yearlyPaise);

  // renewals due in the next 90 days
  const horizon = addDays(today, 90);
  const due = renewalItems(liveProjects, today).filter(r => r.daysLeft >= 0 && r.expiry <= horizon);
  const renewalMonths = [...new Set(due.map(r => ym(r.expiry)))].sort();
  const renewals = renewalMonths.map(month => {
    const list = due.filter(r => ym(r.expiry) === month);
    return { month, amountPaise: list.reduce((a, r) => a + r.amountPaise, 0), count: list.length };
  });

  // unbilled
  const sum = (status: string) => clientWork.filter(w => w.status === status);
  const unbilled = {
    toBillPaise: sum('To bill').reduce((a, w) => a + w.billablePaise, 0),
    toBillCount: sum('To bill').length,
    needsPriceCount: sum('Needs price').length,
    inDraftPaise: sum('In draft').reduce((a, w) => a + w.billablePaise, 0)
  };

  return {
    range,
    from,
    to,
    monthly,
    ageing,
    clients,
    workTypes,
    runningCosts: runningCosts.map(({ clientId: _c, ...r }) => r),
    renewals,
    unbilled,
    totals: {
      invoicedPaise: monthly.reduce((a, m) => a + m.invoicedPaise, 0),
      collectedPaise: monthly.reduce((a, m) => a + m.collectedPaise, 0),
      outstandingPaise: ageing.reduce((a, b) => a + b.balancePaise, 0),
      runningCostsPaise: runningCosts.reduce((a, r) => a + r.yearlyPaise, 0)
    }
  };
}

const rupees = (p: number) => paiseToRupees(p);

/** One report as CSV rows (header first). Amounts in rupees. */
export function reportCsv(r: Reports, key: ReportKey): unknown[][] {
  switch (key) {
    case 'monthly':
      return [
        ['Month', 'Invoiced (₹)', 'Collected (₹)'],
        ...r.monthly.map(m => [monthLabel(m.month), rupees(m.invoicedPaise), rupees(m.collectedPaise)])
      ];
    case 'ageing':
      return [
        ['Age since invoice date', 'Invoices', 'Open balance (₹)'],
        ...r.ageing.map(a => [a.bucket, a.count, rupees(a.balancePaise)])
      ];
    case 'clients':
      return [
        ['Client', 'Invoiced (₹)', 'Collected (₹)'],
        ...r.clients.map(c => [c.clientName, rupees(c.invoicedPaise), rupees(c.collectedPaise)])
      ];
    case 'workTypes':
      return [
        ['Work type', 'Items', 'Billed (₹)'],
        ...r.workTypes.map(w => [w.type, w.count, rupees(w.billedPaise)])
      ];
    case 'runningCosts':
      return [
        ['Project', 'Client', 'Running cost per year (₹)'],
        ...r.runningCosts.map(p => [p.projectName, p.clientName, rupees(p.yearlyPaise)])
      ];
    case 'renewals':
      return [
        ['Month', 'Items', 'Amount (₹)'],
        ...r.renewals.map(m => [monthLabel(m.month), m.count, rupees(m.amountPaise)])
      ];
    case 'unbilled':
      return [
        ['Measure', 'Value'],
        ['To bill (₹)', rupees(r.unbilled.toBillPaise)],
        ['To bill (items)', r.unbilled.toBillCount],
        ['Needs a price (items)', r.unbilled.needsPriceCount],
        ['In draft invoices (₹)', rupees(r.unbilled.inDraftPaise)]
      ];
  }
}
