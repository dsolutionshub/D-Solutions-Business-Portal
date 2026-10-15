/**
 * Invoices and payments: numbering, work links, issue / void / duplicate, payments and receipts.
 * Totals and statuses always come from the step-2 services (via loadInvoices / loadWork).
 */
import {
  addDays,
  checkLinesForIssue,
  formatInr,
  INVOICE_SORTS,
  INVOICE_STATUSES,
  parseSort,
  todayIso,
  type InvoiceCreate,
  type InvoiceDetail,
  type InvoiceDraft,
  type InvoiceLineInput,
  type InvoiceListResponse,
  type InvoicePaperData,
  type InvoiceUpdate,
  type PaymentCreate,
  type PaymentListResponse,
  type PaymentRecorded,
  type PaymentView,
  type invoiceListQuerySchema,
  type paymentListQuerySchema
} from '@dsol/shared';
import { and, eq, gte, lte, ne, sql, type SQL } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { z } from 'zod';
import { badRequest, HttpError, notFound } from '../../middleware/errors';
import { duplicateInvoiceLines } from '../../services/invoiceCalc';
import { workLine, workLinkChanges } from '../../services/workStatus';
import type { Db } from '../client';
import { newId } from '../ids';
import { clients, invoiceLines, invoices, payments, projects, settings, workItems } from '../schema';
import {
  compare,
  getSettings,
  inIds,
  loadInvoices,
  loadPayments,
  loadWork,
  paginate,
  termsDays,
  toListItem,
  type LoadedInvoice
} from './billing';
import { insertAudit, likePattern, runBatch } from './util';

type InvoiceQuery = z.output<typeof invoiceListQuerySchema>;
type PaymentQuery = z.output<typeof paymentListQuerySchema>;

/* ------------------------------------------------------------------ reads */

export async function listInvoices(db: Db, q: InvoiceQuery): Promise<InvoiceListResponse> {
  const where: SQL[] = [];
  if (q.client) where.push(eq(invoices.clientId, q.client));
  if (q.q) {
    const p = likePattern(q.q);
    where.push(
      sql`(lower(${invoices.number}) LIKE ${p} ESCAPE '\\' OR lower(${clients.name}) LIKE ${p} ESCAPE '\\')`
    );
  }
  const scoped = await loadInvoices(db, where.length ? and(...where) : undefined);
  const counts = Object.fromEntries([
    ['all', scoped.length],
    ...INVOICE_STATUSES.map(s => [s, scoped.filter(v => v.status === s).length])
  ]) as InvoiceListResponse['counts'];
  const shown = scoped.filter(v => q.status === 'all' || v.status === q.status);
  const sort = parseSort(q.sort, INVOICE_SORTS, { key: 'date', dir: 'desc' });
  const key = (v: LoadedInvoice) =>
    ({
      date: v.issueDate,
      due: v.dueDate,
      number: v.number,
      client: v.clientName.toLowerCase(),
      balance: v.balancePaise
    })[sort.key];
  shown.sort(
    (a, b) => compare(key(a), key(b)) * (sort.dir === 'asc' ? 1 : -1) || compare(b.number, a.number)
  );

  const all = where.length ? await loadInvoices(db) : scoped;
  const open = all.filter(v => v.balancePaise > 0 && v.storedStatus === 'Sent');
  const overdue = all.filter(v => v.status === 'Overdue');
  const month = todayIso().slice(0, 7);
  const monthPays = await db
    .select({ n: sql<number>`count(*)`, total: sql<number>`coalesce(sum(${payments.amountPaise}), 0)` })
    .from(payments)
    .where(gte(payments.paidOn, `${month}-01`));
  const issued = (v: LoadedInvoice) => v.storedStatus === 'Sent';
  const page = paginate(shown, q.page, q.pageSize);
  return {
    ...page,
    items: page.items.map(toListItem),
    counts,
    viewBalancePaise: shown.filter(issued).reduce((a, v) => a + v.balancePaise, 0),
    summary: {
      outstandingPaise: open.reduce((a, v) => a + v.balancePaise, 0),
      openCount: open.length,
      overduePaise: overdue.reduce((a, v) => a + v.balancePaise, 0),
      overdueCount: overdue.length,
      collectedThisMonthPaise: monthPays[0]?.total ?? 0,
      collectedThisMonthCount: monthPays[0]?.n ?? 0,
      drafts: all.filter(v => v.storedStatus === 'Draft').length
    }
  };
}

async function loadByNumber(db: Db, no: string): Promise<LoadedInvoice> {
  const [v] = await loadInvoices(db, eq(invoices.number, no));
  if (!v) throw notFound(`Invoice ${no}`);
  return v;
}

async function seller(db: Db): Promise<InvoicePaperData['seller']> {
  const s = await getSettings(db);
  return { company: s?.company ?? 'D Solutions', address: s?.address ?? null, gstin: s?.gstin ?? null };
}

export async function getInvoice(db: Db, no: string): Promise<InvoiceDetail> {
  const v = await loadByNumber(db, no);
  const [lines, pays, client, from] = await Promise.all([
    db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, v.id)).orderBy(invoiceLines.sortOrder),
    loadPayments(db, eq(payments.invoiceId, v.id)),
    db.select().from(clients).where(eq(clients.id, v.clientId)).limit(1),
    seller(db)
  ]);
  const workIds = lines.map(l => l.workItemId).filter((x): x is string => !!x);
  const work = workIds.length ? await loadWork(db, inIds(workItems.id, workIds)) : [];
  const c = client[0]!;
  const r = v.row;
  return {
    ...toListItem(v),
    discountPct: r.discountPct,
    gstRate: r.gstRate,
    notes: r.notes,
    paymentInstructions: r.paymentInstructions,
    terms: r.terms,
    lines,
    payments: pays.sort((a, b) => compare(b.paidOn, a.paidOn)),
    work,
    paper: {
      ...toListItem(v),
      status: v.status,
      discountPct: r.discountPct,
      gstRate: r.gstRate,
      seller: from,
      client: {
        name: c.name,
        address: [c.addr1, c.addr2, c.city, [c.state, c.pin].filter(Boolean).join(' ')]
          .filter(Boolean)
          .join(', '),
        gstin: c.gstin,
        terms: c.paymentTerms
      },
      projectName: v.projectName,
      lines,
      paymentInstructions: r.paymentInstructions,
      notes: r.notes,
      terms: r.terms
    },
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  };
}

/* ------------------------------------------------------------- validation */

async function checkClientProject(db: Db, clientId: string, projectId: string | null) {
  const [c] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, clientId));
  if (!c) throw badRequest('Select a client.', { clientId: 'Select a client.' });
  if (projectId) {
    const [p] = await db
      .select({ clientId: projects.clientId })
      .from(projects)
      .where(eq(projects.id, projectId));
    if (!p || p.clientId !== clientId)
      throw badRequest('That project is not this client’s.', { projectId: 'Pick a project of this client.' });
  }
}

/**
 * Lines that bill delivered work: the work must exist, belong to this client, be billable and not
 * already be on another non-void invoice. A work item may appear on only one line.
 */
async function checkWorkLines(
  db: Db,
  clientId: string,
  lines: readonly InvoiceLineInput[],
  invoiceId?: string
) {
  const ids = lines.map(l => l.workItemId).filter((x): x is string => !!x);
  if (!ids.length) return;
  const work = new Map((await loadWork(db, inIds(workItems.id, ids))).map(w => [w.id, w]));
  const fields: Record<string, string> = {};
  const seen = new Set<string>();
  lines.forEach((l, i) => {
    if (!l.workItemId) return;
    const w = work.get(l.workItemId);
    const path = `lines.${i}.workItemId`;
    if (!w) fields[path] = 'That delivered work no longer exists.';
    else if (w.clientId !== clientId) fields[path] = `“${w.title}” is another client’s work.`;
    else if (w.billing === 'Free') fields[path] = `“${w.title}” is marked not billable.`;
    else if (seen.has(w.id)) fields[path] = `“${w.title}” is already on this invoice.`;
    else if (w.invoiceId && w.invoiceId !== invoiceId && w.invoiceNo)
      fields[path] = `“${w.title}” is already on ${w.invoiceNo}.`;
    seen.add(l.workItemId);
  });
  if (Object.keys(fields).length)
    throw new HttpError(409, 'work_already_billed', Object.values(fields)[0]!, fields);
}

const lineRows = (invoiceId: string, lines: readonly InvoiceLineInput[]) =>
  lines.map((l, i) => ({
    id: newId('invoiceLine'),
    invoiceId,
    ...l,
    description: l.description.trim(),
    sortOrder: i
  }));

/** Statements that point work items at this invoice (linked) and release the ones taken off it. */
async function linkStatements(
  db: Db,
  invoiceId: string,
  lines: readonly InvoiceLineInput[]
): Promise<BatchItem<'sqlite'>[]> {
  const current = (
    await db.select({ id: workItems.id }).from(workItems).where(eq(workItems.invoiceId, invoiceId))
  ).map(w => w.id);
  const { link, unlink } = workLinkChanges(lines, current);
  return [
    ...(link.length ? [db.update(workItems).set({ invoiceId }).where(inIds(workItems.id, link))] : []),
    ...(unlink.length
      ? [db.update(workItems).set({ invoiceId: null }).where(inIds(workItems.id, unlink))]
      : [])
  ];
}

const issueCheck = z
  .object({
    lines: z.array(z.object({ description: z.string(), quantity: z.number(), unitPricePaise: z.number() }))
  })
  .superRefine(checkLinesForIssue);

/* ------------------------------------------------------------------ writes */

/**
 * Create an invoice. The number comes from Settings (prefix + next number) and is taken in the
 * same D1 batch (one transaction) as the insert, so two invoices can never get the same number
 * and no number is skipped when a save fails.
 */
export async function createInvoice(db: Db, input: InvoiceCreate, userId: string): Promise<string> {
  await checkClientProject(db, input.clientId, input.projectId);
  await checkWorkLines(db, input.clientId, input.lines);
  const s = await getSettings(db);
  if (!s) throw new HttpError(409, 'no_settings', 'Set up company and invoicing settings first.');
  const id = newId('invoice');
  const { lines, ...v } = input;
  const statements: BatchItem<'sqlite'>[] = [
    // The number is read from Settings inside the insert itself and Settings is bumped in the same
    // batch (one transaction): numbers are unique and never skipped.
    db.insert(invoices).values({
      id,
      ...v,
      number: sql`(SELECT ${settings.invoicePrefix} || printf('%04d', ${settings.nextInvoiceNo}) FROM ${settings} WHERE ${settings.id} = 1)`
    }),
    db
      .update(settings)
      .set({ nextInvoiceNo: sql`${settings.nextInvoiceNo} + 1` })
      .where(eq(settings.id, 1)),
    db.insert(invoiceLines).values(lineRows(id, lines)),
    ...(await linkStatements(db, id, lines))
  ];
  if (input.status === 'Sent')
    statements.push(insertAudit(db, { userId, action: 'invoice.issue', entity: 'invoice', entityId: id }));
  try {
    await runBatch(db, statements);
  } catch (e) {
    if (/UNIQUE constraint failed: invoices\.number/.test(String(e) + String((e as Error).cause ?? ''))) {
      const taken = `${s.invoicePrefix}${String(s.nextInvoiceNo).padStart(4, '0')}`;
      throw new HttpError(
        409,
        'number_taken',
        `Invoice number ${taken} already exists. Raise “Next invoice number” in Settings.`
      );
    }
    throw e;
  }
  const [row] = await db.select({ number: invoices.number }).from(invoices).where(eq(invoices.id, id));
  return row!.number;
}

/** Drafts only: replaces fields and lines, relinks work. */
export async function updateInvoice(db: Db, no: string, input: InvoiceUpdate): Promise<void> {
  const v = await loadByNumber(db, no);
  if (v.storedStatus !== 'Draft')
    throw new HttpError(
      409,
      'not_draft',
      `${no} has been issued and can't be edited. Void it and create a new one if it's wrong.`
    );
  await checkClientProject(db, input.clientId, input.projectId);
  await checkWorkLines(db, input.clientId, input.lines, v.id);
  const { lines, ...fields } = input;
  await runBatch(db, [
    db.update(invoices).set(fields).where(eq(invoices.id, v.id)),
    db.delete(invoiceLines).where(eq(invoiceLines.invoiceId, v.id)),
    db.insert(invoiceLines).values(lineRows(v.id, lines)),
    ...(await linkStatements(db, v.id, lines))
  ]);
}

export async function issueInvoice(db: Db, no: string, userId: string): Promise<void> {
  const v = await loadByNumber(db, no);
  if (v.storedStatus !== 'Draft')
    throw new HttpError(409, 'not_draft', `${no} is already ${v.status.toLowerCase()}.`);
  const lines = await db
    .select()
    .from(invoiceLines)
    .where(eq(invoiceLines.invoiceId, v.id))
    .orderBy(invoiceLines.sortOrder);
  const check = issueCheck.safeParse({ lines });
  if (!check.success)
    throw badRequest('Complete every line (description, quantity and price) before issuing.');
  await checkWorkLines(db, v.clientId, lines, v.id);
  await runBatch(db, [
    db.update(invoices).set({ status: 'Sent' }).where(eq(invoices.id, v.id)),
    insertAudit(db, {
      userId,
      action: 'invoice.issue',
      entity: 'invoice',
      entityId: v.id,
      meta: { number: no }
    })
  ]);
}

/** Only without payments. Its work counts as "To bill" again (derived — the links stay for history). */
export async function voidInvoice(db: Db, no: string, userId: string): Promise<void> {
  const v = await loadByNumber(db, no);
  if (v.storedStatus === 'Void') return;
  if (v.paidPaise > 0)
    throw new HttpError(
      409,
      'has_payments',
      `${no} has ${formatInr(v.paidPaise)} in payments, so it can't be voided.`
    );
  await runBatch(db, [
    db.update(invoices).set({ status: 'Void' }).where(eq(invoices.id, v.id)),
    insertAudit(db, {
      userId,
      action: 'invoice.void',
      entity: 'invoice',
      entityId: v.id,
      meta: { number: no }
    })
  ]);
}

const dueFor = async (db: Db, clientId: string, issueDate: string) => {
  const [c] = await db.select({ terms: clients.paymentTerms }).from(clients).where(eq(clients.id, clientId));
  return addDays(issueDate, termsDays(c?.terms));
};

/** A new draft with the same lines — never the same work links, so nothing is billed twice. */
export async function duplicateInvoice(db: Db, no: string, userId: string): Promise<string> {
  const v = await loadByNumber(db, no);
  const lines = await db
    .select()
    .from(invoiceLines)
    .where(eq(invoiceLines.invoiceId, v.id))
    .orderBy(invoiceLines.sortOrder);
  const today = todayIso();
  return createInvoice(
    db,
    {
      clientId: v.clientId,
      projectId: v.projectId,
      issueDate: today,
      dueDate: await dueFor(db, v.clientId, today),
      discountPct: v.row.discountPct,
      gstRate: 0, // invoices carry no GST, even a copy of an older one that did
      notes: v.row.notes,
      paymentInstructions: v.row.paymentInstructions,
      terms: v.row.terms,
      status: 'Draft',
      lines: duplicateInvoiceLines(lines)
    },
    userId
  );
}

/** Defaults for a new invoice: today, due by the client's terms, no GST, bank details from Settings. */
export async function draftDefaults(db: Db, clientId: string | null): Promise<InvoiceDraft> {
  const s = await getSettings(db);
  const today = todayIso();
  return {
    clientId: clientId ?? '',
    projectId: null,
    issueDate: today,
    dueDate: clientId ? await dueFor(db, clientId, today) : addDays(today, 15),
    discountPct: 0,
    gstRate: 0,
    lines: [{ description: '', quantity: 1, unitPricePaise: 0, workItemId: null }],
    paymentInstructions: [s?.bank, s?.upi ? `UPI: ${s.upi}` : null].filter(Boolean).join('\n') || null,
    notes: null,
    terms: null
  };
}

/** A prefilled draft for chosen "To bill" work (one client). Lines use the prototype's wording. */
export async function draftFromWork(db: Db, ids: string[]): Promise<InvoiceDraft> {
  const work = await loadWork(db, inIds(workItems.id, ids));
  if (work.length !== new Set(ids).size) throw badRequest('Some of that work no longer exists.');
  const clientIds = new Set(work.map(w => w.clientId));
  if (clientIds.size > 1) throw badRequest('Pick work for one client at a time to create an invoice.');
  const notReady = work.find(w => w.status !== 'To bill');
  if (notReady)
    throw badRequest(
      `“${notReady.title}” is ${notReady.status.toLowerCase()} — only “To bill” work can be invoiced.`
    );
  const projectIds = [...new Set(work.map(w => w.projectId))];
  const ordered = ids.map(id => work.find(w => w.id === id)!);
  return {
    ...(await draftDefaults(db, ordered[0]!.clientId)),
    projectId: projectIds.length === 1 ? projectIds[0]! : null,
    lines: ordered.map(w => workLine(w, w.releaseVersion))
  };
}

/* --------------------------------------------------------------- payments */

export async function listPayments(db: Db, q: PaymentQuery): Promise<PaymentListResponse> {
  const where: SQL[] = [];
  if (q.client) where.push(eq(clients.id, q.client));
  if (q.invoice) where.push(eq(invoices.number, q.invoice));
  if (q.from) where.push(gte(payments.paidOn, q.from));
  if (q.to) where.push(lte(payments.paidOn, q.to));
  if (q.q) {
    const p = likePattern(q.q);
    where.push(
      sql`(lower(${payments.reference}) LIKE ${p} ESCAPE '\\' OR lower(${payments.receiptNo}) LIKE ${p} ESCAPE '\\' OR lower(${invoices.number}) LIKE ${p} ESCAPE '\\' OR lower(${clients.name}) LIKE ${p} ESCAPE '\\')`
    );
  }
  const all = (await loadPayments(db, where.length ? and(...where) : undefined)).sort(
    (a, b) => compare(b.paidOn, a.paidOn) || compare(b.receiptNo, a.receiptNo)
  );
  const open = (await loadInvoices(db, eq(invoices.status, 'Sent'))).filter(v => v.balancePaise > 0);
  const byClient = new Map<
    string,
    { clientId: string; clientName: string; balancePaise: number; overdue: boolean }
  >();
  for (const v of open) {
    const c = byClient.get(v.clientId) ?? {
      clientId: v.clientId,
      clientName: v.clientName,
      balancePaise: 0,
      overdue: false
    };
    c.balancePaise += v.balancePaise;
    c.overdue ||= v.status === 'Overdue';
    byClient.set(v.clientId, c);
  }
  return {
    ...paginate(all, q.page, q.pageSize),
    totalPaise: all.reduce((a, p) => a + p.amountPaise, 0),
    outstanding: [...byClient.values()].sort((a, b) => b.balancePaise - a.balancePaise)
  };
}

export async function getPayment(
  db: Db,
  id: string
): Promise<{ payment: PaymentView; seller: InvoicePaperData['seller']; balancePaise: number }> {
  const [p] = await loadPayments(db, eq(payments.id, id));
  if (!p) throw notFound('Payment');
  const inv = await loadByNumber(db, p.invoiceNo);
  return { payment: p, seller: await seller(db), balancePaise: inv.balancePaise };
}

/**
 * Record a payment against an issued invoice: more than 0 and at most the balance due.
 * The receipt number (RCPT-####) is computed inside the INSERT, so it's sequential and unique.
 */
export async function recordPayment(db: Db, input: PaymentCreate, userId: string): Promise<PaymentRecorded> {
  const v = await loadByNumber(db, input.invoiceNo);
  if (v.storedStatus === 'Draft')
    throw new HttpError(409, 'not_issued', `${v.number} is a draft — issue it before recording payments.`, {
      invoiceNo: 'Issue this invoice first.'
    });
  if (v.storedStatus === 'Void')
    throw new HttpError(409, 'void', `${v.number} is void and can't be paid.`, {
      invoiceNo: 'This invoice is void.'
    });
  if (v.balancePaise <= 0)
    throw new HttpError(409, 'paid', `${v.number} is already paid in full.`, {
      invoiceNo: 'Already paid in full.'
    });
  if (input.amountPaise > v.balancePaise)
    throw badRequest(`Exceeds balance due (${formatInr(v.balancePaise)}).`, {
      amountPaise: `Exceeds balance due (${formatInr(v.balancePaise)}).`
    });

  const id = newId('payment');
  await runBatch(db, [
    db.insert(payments).values({
      id,
      invoiceId: v.id,
      paidOn: input.paidOn,
      method: input.method,
      reference: input.reference,
      amountPaise: input.amountPaise,
      note: input.note,
      // next RCPT-#### computed inside the insert, so it's sequential and unique
      receiptNo: sql`(SELECT 'RCPT-' || printf('%04d', coalesce(max(CAST(substr(${payments.receiptNo}, 6) AS INTEGER)), 0) + 1) FROM ${payments} WHERE ${payments.receiptNo} LIKE 'RCPT-%')`
    }),
    insertAudit(db, {
      userId,
      action: 'payment.record',
      entity: 'invoice',
      entityId: v.id,
      meta: { number: v.number, amountPaise: input.amountPaise }
    })
  ]);
  const [payment] = await loadPayments(db, eq(payments.id, id));
  const after = await loadByNumber(db, v.number);
  const settled = after.balancePaise === 0;
  const workPaid = settled
    ? (
        await db
          .select({ id: workItems.id })
          .from(workItems)
          .where(and(eq(workItems.invoiceId, v.id), ne(workItems.billing, 'Free')))
      ).length
    : 0;
  return { payment: payment!, invoice: toListItem(after), settled, workPaid };
}
