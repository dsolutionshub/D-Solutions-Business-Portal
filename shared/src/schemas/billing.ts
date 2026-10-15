/**
 * Releases → billable work → invoices → payments: list filters, the "add to billing" body,
 * and the response shapes the API returns (derived statuses and totals included).
 */
import { z } from 'zod';
import {
  BILLING_MODES,
  INVOICE_STATUSES,
  RELEASE_STATUSES,
  WORK_STATUSES,
  WORK_TYPES,
  type InvoiceStatus,
  type InvoiceStoredStatus,
  type ReleaseMailStatus,
  type ReleaseStatus,
  type WorkStatus
} from '../constants';
import type { Paginated } from './api';
import { listQuerySchema } from './api';
import { id } from './common';
import type { InvoiceTotals } from './invoice';
import type { InvoiceLine, InvoiceLineInput } from './invoiceLine';
import type { Payment } from './payment';
import type { WorkItem } from './workItem';

/* -------------------------------------------------------------- releases */

export const RELEASE_SORTS = ['date', 'version', 'project'] as const;

export const releaseListQuerySchema = listQuerySchema.extend({
  client: id.optional(),
  project: id.optional(),
  env: z.string().max(12).optional(),
  status: z.enum(['all', ...RELEASE_STATUSES]).default('all')
});

/** How a release's features and fixes stand in Billable work. */
export interface ReleaseBilling {
  /** features + fixes on the release */
  items: number;
  /** of those, already in Billable work */
  added: number;
  /** Needs price or To bill */
  open: number;
  /** In draft, Invoiced, Overdue, Part paid */
  unpaid: number;
  paid: number;
  notBillable: number;
  /** on a non-void invoice (blocks deleting the release) */
  invoiced: number;
}

export interface ReleaseView {
  id: string;
  projectId: string;
  projectName: string;
  clientId: string;
  clientName: string;
  version: string;
  environment: string;
  releaseDate: string;
  status: ReleaseStatus;
  releasedBy: string | null;
  releasedByName: string | null;
  mailStatus: ReleaseMailStatus;
  features: string[];
  fixes: string[];
  issues: string[];
  billing: ReleaseBilling;
  createdAt: string;
  updatedAt: string;
}

export interface ReleaseListResponse extends Paginated<ReleaseView> {
  summary: { thisMonth: number; deployedProd: number; failed: number; mailPending: number };
}

/**
 * POST /api/releases/:id/bill — put a release's features and fixes into Billable work.
 * value: Fixed → amount in paise (0 or null = price later) · Hourly → hours · Free → ignored.
 * Items already billed from this release (same title) are skipped.
 */
export const releaseBillSchema = z.object({
  items: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(300),
        kind: z.enum(['Feature', 'Bug fix']),
        billing: z.enum(BILLING_MODES),
        value: z.number().min(0).max(100_000_000_00).nullable()
      })
    )
    .min(1, 'Tick at least one item.')
    .max(200)
});

/* ------------------------------------------------------------------ work */

/** "open" = Needs price / To bill / In draft · "billed" = Invoiced / Overdue / Part paid */
export const WORK_FILTERS = ['open', 'billed', 'all', ...WORK_STATUSES] as const;
export type WorkFilter = (typeof WORK_FILTERS)[number];

export const workListQuerySchema = listQuerySchema.extend({
  client: id.optional(),
  project: id.optional(),
  release: id.optional(),
  type: z.enum(WORK_TYPES).optional(),
  status: z.enum(WORK_FILTERS).default('open')
});

export interface WorkView extends WorkItem {
  clientId: string;
  clientName: string;
  projectName: string;
  releaseVersion: string | null;
  /** number of the linked invoice, if it isn't void */
  invoiceNo: string | null;
  invoiceStatus: InvoiceStatus | null;
  /** amount to bill (fixed amount, or hours × rate) */
  billablePaise: number;
  status: WorkStatus;
}

export interface WorkSummary {
  toBill: { count: number; amountPaise: number; clients: number };
  needsPrice: { count: number };
  billed: { count: number; amountPaise: number; overdueCount: number };
  paid: { count: number; amountPaise: number };
  notBillable: { count: number };
}

export interface WorkListResponse extends Paginated<WorkView> {
  summary: WorkSummary;
  /** number of items per filter chip (within the client/project/type/search filters) */
  counts: Record<WorkFilter, number>;
  /** sum of billable amounts of everything matching the filters (all pages) */
  viewTotalPaise: number;
}

/* -------------------------------------------------------------- invoices */

export const INVOICE_SORTS = ['date', 'due', 'number', 'client', 'balance'] as const;

export const invoiceListQuerySchema = listQuerySchema.extend({
  client: id.optional(),
  status: z.enum(['all', ...INVOICE_STATUSES]).default('all')
});

export interface InvoiceListItem extends InvoiceTotals {
  id: string;
  number: string;
  clientId: string;
  clientName: string;
  projectId: string | null;
  projectName: string | null;
  issueDate: string;
  dueDate: string;
  storedStatus: InvoiceStoredStatus;
}

export interface InvoiceListResponse extends Paginated<InvoiceListItem> {
  counts: Record<'all' | InvoiceStatus, number>;
  summary: {
    outstandingPaise: number;
    openCount: number;
    overduePaise: number;
    overdueCount: number;
    collectedThisMonthPaise: number;
    collectedThisMonthCount: number;
    drafts: number;
  };
  /** balance due of issued invoices matching the filters (all pages) */
  viewBalancePaise: number;
}

/** Everything the invoice paper (preview, detail, PDF) needs. */
export interface InvoicePaperData extends Omit<InvoiceTotals, 'status'> {
  number: string;
  /** null while composing a new invoice (no number yet) */
  status: InvoiceStatus | null;
  issueDate: string;
  dueDate: string;
  discountPct: number;
  gstRate: number;
  seller: { company: string; address: string | null; gstin: string | null };
  client: { name: string; address: string; gstin: string | null; terms: string | null };
  projectName: string | null;
  lines: { description: string; quantity: number; unitPricePaise: number }[];
  paymentInstructions: string | null;
  notes: string | null;
  terms: string | null;
}

export interface PaymentView extends Payment {
  invoiceNo: string;
  clientId: string;
  clientName: string;
}

export interface InvoiceDetail extends InvoiceListItem {
  discountPct: number;
  gstRate: number;
  notes: string | null;
  paymentInstructions: string | null;
  terms: string | null;
  lines: InvoiceLine[];
  payments: PaymentView[];
  /** work items billed on this invoice (from its lines) */
  work: WorkView[];
  paper: InvoicePaperData;
  createdAt: string;
  updatedAt: string;
}

/** GET /api/invoices/new-from-work?ids=… and the editor's starting point. */
export interface InvoiceDraft {
  clientId: string;
  projectId: string | null;
  issueDate: string;
  dueDate: string;
  discountPct: number;
  gstRate: number;
  lines: InvoiceLineInput[];
  paymentInstructions: string | null;
  notes: string | null;
  terms: string | null;
}

/** POST /api/payments response: the toast says "invoice settled · n work items now Paid". */
export interface PaymentRecorded {
  payment: PaymentView;
  invoice: InvoiceListItem;
  settled: boolean;
  workPaid: number;
}

export interface PaymentListResponse extends Paginated<PaymentView> {
  totalPaise: number;
  /** open balances by client (issued invoices), largest first */
  outstanding: { clientId: string; clientName: string; balancePaise: number; overdue: boolean }[];
}

export const newFromWorkQuerySchema = z.object({
  ids: z
    .string()
    .min(1, 'Choose the work to invoice.')
    .transform(s => s.split(',').filter(Boolean))
    .pipe(z.array(id).min(1).max(200))
});

export type ReleaseListQuery = z.input<typeof releaseListQuerySchema>;
export type ReleaseBill = z.infer<typeof releaseBillSchema>;
export type WorkListQuery = z.input<typeof workListQuerySchema>;
export type InvoiceListQuery = z.input<typeof invoiceListQuerySchema>;
