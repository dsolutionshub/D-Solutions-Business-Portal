/** Invoice reads used by client archiving (unpaid-invoice check). Full invoicing lives in invoicing.ts. */
import { todayIso, type InvoiceTotals } from '@dsol/shared';
import { and, eq, inArray } from 'drizzle-orm';
import { invoiceCalc } from '../../services/invoiceCalc';
import type { Db } from '../client';
import { invoiceLines, invoices, payments } from '../schema';

export interface InvoiceWithTotals extends InvoiceTotals {
  id: string;
  number: string;
  clientId: string;
  dueDate: string;
}

/** Issued (Sent) invoices of a client with their derived totals and status. */
export async function issuedInvoicesForClient(db: Db, clientId: string): Promise<InvoiceWithTotals[]> {
  const invs = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.clientId, clientId), eq(invoices.status, 'Sent')));
  if (!invs.length) return [];
  // sub-query, not a list of ids (D1's 100-parameter limit)
  const ids = db
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.clientId, clientId), eq(invoices.status, 'Sent')));
  const [lines, pays] = await Promise.all([
    db.select().from(invoiceLines).where(inArray(invoiceLines.invoiceId, ids)),
    db.select().from(payments).where(inArray(payments.invoiceId, ids))
  ]);
  const today = todayIso();
  return invs.map(v => ({
    id: v.id,
    number: v.number,
    clientId: v.clientId,
    dueDate: v.dueDate,
    ...invoiceCalc(
      {
        status: v.status,
        dueDate: v.dueDate,
        discountPct: v.discountPct,
        gstRate: v.gstRate,
        lines: lines.filter(l => l.invoiceId === v.id),
        payments: pays.filter(p => p.invoiceId === v.id)
      },
      today
    )
  }));
}

export async function unpaidInvoicesForClient(db: Db, clientId: string) {
  return (await issuedInvoicesForClient(db, clientId)).filter(v => v.balancePaise > 0);
}
