/**
 * Invoices. Only Draft / Sent / Void is stored; Paid, Partially paid and Overdue are derived from
 * payments and the due date, together with all totals (server/src/services/invoiceCalc.ts).
 * Invoice numbers are allocated by the server from Settings (prefix + next number).
 */
import { z } from 'zod';
import { INVOICE_STATUSES, INVOICE_STORED_STATUSES } from '../constants';
import { gstRate, id, isoDate, optionalText, paise, percent, requiredText, timestamps } from './common';
import { invoiceLineInputSchema } from './invoiceLine';

const invoiceInputFields = {
  clientId: z.string().min(1, 'Select a client.').max(64),
  projectId: id.nullable(),
  issueDate: isoDate,
  dueDate: isoDate,
  discountPct: percent,
  gstRate,
  notes: optionalText(2000),
  paymentInstructions: optionalText(1000),
  terms: optionalText(1000)
};

export const invoiceSchema = z.object({
  id,
  /** e.g. INV-2026-0148 */
  number: requiredText('Invoice number is required.', 40),
  ...invoiceInputFields,
  status: z.enum(INVOICE_STORED_STATUSES),
  ...timestamps
});

export const invoiceTotalsSchema = z.object({
  subtotalPaise: paise,
  discountPaise: paise,
  taxablePaise: paise,
  taxPaise: paise,
  cgstPaise: paise,
  sgstPaise: paise,
  totalPaise: paise,
  paidPaise: paise,
  balancePaise: paise,
  status: z.enum(INVOICE_STATUSES)
});

type DraftCheck = {
  issueDate?: string;
  dueDate?: string;
  lines?: { description: string; quantity: number; unitPricePaise: number }[];
};

/** Due date ≥ invoice date. */
const checkDates = (v: DraftCheck, ctx: z.RefinementCtx) => {
  if (v.issueDate && v.dueDate && v.dueDate < v.issueDate)
    ctx.addIssue({
      code: 'custom',
      path: ['dueDate'],
      message: 'Due date must be on or after the invoice date.'
    });
};

/** Issuing needs every line complete; drafts may be unfinished. */
export const checkLinesForIssue = (v: DraftCheck, ctx: z.RefinementCtx) => {
  v.lines?.forEach((l, i) => {
    if (!l.description.trim())
      ctx.addIssue({ code: 'custom', path: ['lines', i, 'description'], message: 'Required' });
    if (!(l.quantity > 0))
      ctx.addIssue({ code: 'custom', path: ['lines', i, 'quantity'], message: 'Must be more than 0' });
    if (!(l.unitPricePaise > 0))
      ctx.addIssue({ code: 'custom', path: ['lines', i, 'unitPricePaise'], message: 'Must be more than 0' });
  });
};

const lines = z.array(invoiceLineInputSchema).min(1, 'Add at least one line.').max(200);

/** Create as a draft or issue straight away (`status: 'Sent'`). The number is allocated by the server. */
export const invoiceCreateSchema = z
  .object({ ...invoiceInputFields, status: z.enum(['Draft', 'Sent']), lines })
  .superRefine((v, ctx) => {
    checkDates(v, ctx);
    if (v.status === 'Sent') checkLinesForIssue(v, ctx);
  });

/** Drafts only. The whole editor is sent (lines replace the old ones). Status changes use issue/void. */
export const invoiceUpdateSchema = z.object({ ...invoiceInputFields, lines }).superRefine(checkDates);

export type Invoice = z.infer<typeof invoiceSchema>;
export type InvoiceTotals = z.infer<typeof invoiceTotalsSchema>;
export type InvoiceCreate = z.infer<typeof invoiceCreateSchema>;
export type InvoiceCreateInput = z.input<typeof invoiceCreateSchema>;
export type InvoiceUpdate = z.infer<typeof invoiceUpdateSchema>;
