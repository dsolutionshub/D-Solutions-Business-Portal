/** GET /api/reports — every number computed from invoices, payments, work and project sheets. */
import { z } from 'zod';
import { WORK_TYPES, type WorkType } from '../constants';
import { id } from './common';

export const REPORT_RANGES = ['6M', '12M', 'YTD'] as const;
export type ReportRange = (typeof REPORT_RANGES)[number];

export const REPORT_KEYS = [
  'monthly',
  'ageing',
  'clients',
  'workTypes',
  'runningCosts',
  'renewals',
  'unbilled'
] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

export const reportQuerySchema = z.object({
  range: z.enum(REPORT_RANGES).default('6M'),
  client: id.optional()
});

export const AGEING_BUCKETS = ['0–30 days', '31–60 days', '61–90 days', '90+ days'] as const;

export interface Reports {
  range: ReportRange;
  /** first and last day covered (IST) */
  from: string;
  to: string;
  /** "2026-05" … */
  monthly: { month: string; invoicedPaise: number; collectedPaise: number }[];
  /** open balances of issued invoices, by age since the invoice date */
  ageing: { bucket: (typeof AGEING_BUCKETS)[number]; balancePaise: number; count: number }[];
  /** invoiced in the range (issued, not void), largest first */
  clients: { clientId: string; clientName: string; invoicedPaise: number; collectedPaise: number }[];
  /** delivered work billed on issued invoices dated in the range */
  workTypes: { type: WorkType; billedPaise: number; count: number }[];
  /** yearly running cost per active project (domain + SSL + hosting + recurring costs) */
  runningCosts: { projectId: string; projectName: string; clientName: string; yearlyPaise: number }[];
  /** renewals due in the next 90 days, by month */
  renewals: { month: string; amountPaise: number; count: number }[];
  unbilled: { toBillPaise: number; toBillCount: number; needsPriceCount: number; inDraftPaise: number };
  totals: {
    invoicedPaise: number;
    collectedPaise: number;
    outstandingPaise: number;
    runningCostsPaise: number;
  };
}

export { WORK_TYPES as REPORT_WORK_TYPES };
