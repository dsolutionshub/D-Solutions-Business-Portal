/**
 * Delivered work → billing (prototype: workAmount / workCalc / workLine / syncWorkLinks).
 *
 *   Not billable → Needs price → To bill → In draft → Invoiced / Overdue → Part paid → Paid
 *
 * The status comes from the linked invoice's derived status. A voided invoice counts as no
 * invoice, so its work goes back to "To bill" (or "Needs price" if it has no amount).
 */
import type { BillingMode, InvoiceStatus, WorkStatus, WorkType } from '../constants';
import type { InvoiceLineInput } from '../schemas/invoiceLine';

export interface WorkPricing {
  billing: BillingMode;
  amountPaise: number;
  hours: number;
  ratePaise: number;
}

/** Amount to bill. */
export function workAmountPaise(w: WorkPricing): number {
  if (w.billing === 'Free') return 0;
  if (w.billing === 'Hourly') return Math.round(w.hours * w.ratePaise);
  return w.amountPaise;
}

/**
 * @param linkedInvoiceStatus derived status of the invoice in work.invoiceId, or null if none
 */
export function workStatus(w: WorkPricing, linkedInvoiceStatus: InvoiceStatus | null): WorkStatus {
  if (w.billing === 'Free') return 'Not billable';
  if (linkedInvoiceStatus === null || linkedInvoiceStatus === 'Void')
    return workAmountPaise(w) > 0 ? 'To bill' : 'Needs price';
  switch (linkedInvoiceStatus) {
    case 'Draft':
      return 'In draft';
    case 'Paid':
      return 'Paid';
    case 'Overdue':
      return 'Overdue';
    case 'Partially paid':
      return 'Part paid';
    case 'Sent':
      return 'Invoiced';
  }
}

/** Invoice line for a work item, e.g. "Bug fix: Cart flicker (v3.8.0) — 4 h". */
export function workLine(
  w: WorkPricing & { id: string; type: WorkType; title: string },
  releaseVersion?: string | null
): InvoiceLineInput {
  const hourly = w.billing === 'Hourly';
  return {
    description: `${w.type}: ${w.title}${releaseVersion ? ` (${releaseVersion})` : ''}${hourly ? ` — ${w.hours} h` : ''}`,
    quantity: hourly ? w.hours : 1,
    unitPricePaise: hourly ? w.ratePaise : workAmountPaise(w),
    workItemId: w.id
  };
}

/**
 * After an invoice's lines are saved: which work items to link to it and which to unlink
 * (work that was on this invoice but whose line was removed).
 *
 * @param lines            the invoice's lines after saving
 * @param linkedToInvoice  ids of work items whose invoiceId currently is this invoice
 */
export function workLinkChanges(
  lines: readonly { workItemId: string | null }[],
  linkedToInvoice: readonly string[]
): { link: string[]; unlink: string[] } {
  const onInvoice = new Set(lines.map(l => l.workItemId).filter((x): x is string => !!x));
  return {
    link: [...onInvoice].filter(id => !linkedToInvoice.includes(id)),
    unlink: linkedToInvoice.filter(id => !onInvoice.has(id))
  };
}
