/**
 * Shared loaders for releases, work, invoices and payments: rows joined with names, plus every
 * derived value (invoice totals/status, work amount/status) computed by the step-2 services.
 * Nothing derived is stored.
 *
 * D1 allows at most 100 bound parameters per query, so filters use sub-queries rather than long
 * IN (…) lists, and explicit id lists go through `inChunks`.
 */
import {
  todayIso,
  type InvoiceListItem,
  type InvoiceStatus,
  type PaymentView,
  type WorkView
} from '@dsol/shared';
import { eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import { invoiceCalc } from '../../services/invoiceCalc';
import { workAmountPaise, workStatus } from '../../services/workStatus';
import type { Db } from '../client';
import {
  clients,
  invoiceLines,
  invoices,
  payments,
  projects,
  releases,
  settings,
  workItems
} from '../schema';

const CHUNK = 90;

/** Run a query for ids in batches of 90 (D1's 100-parameter limit) and concatenate the rows. */
export async function inChunks<T>(
  ids: readonly string[],
  run: (chunk: string[]) => Promise<T[]>
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) out.push(...(await run(ids.slice(i, i + CHUNK))));
  return out;
}

/** `column IN (ids)` split into OR-ed groups of 90 (for use inside a single statement). */
export function inIds(column: SQLiteColumn, ids: readonly string[]): SQL {
  if (!ids.length) return sql`0`;
  const groups: SQL[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) groups.push(inArray(column, ids.slice(i, i + CHUNK)));
  return sql.join(groups, sql` OR `);
}

/* --------------------------------------------------------------- invoices */

export interface LoadedInvoice extends InvoiceListItem {
  row: typeof invoices.$inferSelect;
}

/** Invoices (optionally filtered) with client/project names and computed totals + status. */
export async function loadInvoices(db: Db, where?: SQL, today = todayIso()): Promise<LoadedInvoice[]> {
  const rows = await db
    .select({ invoice: invoices, clientName: clients.name, projectName: projects.name })
    .from(invoices)
    .innerJoin(clients, eq(clients.id, invoices.clientId))
    .leftJoin(projects, eq(projects.id, invoices.projectId))
    .where(where);
  if (!rows.length) return [];
  // same joins as above, so filters on client/project names work in the sub-query too
  const ids = db
    .select({ id: invoices.id })
    .from(invoices)
    .innerJoin(clients, eq(clients.id, invoices.clientId))
    .leftJoin(projects, eq(projects.id, invoices.projectId))
    .where(where);
  const [lineRows, payRows] = await Promise.all([
    db
      .select({
        invoiceId: invoiceLines.invoiceId,
        quantity: invoiceLines.quantity,
        unitPricePaise: invoiceLines.unitPricePaise
      })
      .from(invoiceLines)
      .where(inArray(invoiceLines.invoiceId, ids)),
    db
      .select({ invoiceId: payments.invoiceId, amountPaise: payments.amountPaise })
      .from(payments)
      .where(inArray(payments.invoiceId, ids))
  ]);
  const linesBy = groupBy(lineRows, l => l.invoiceId);
  const paysBy = groupBy(payRows, p => p.invoiceId);
  return rows.map(({ invoice: v, clientName, projectName }) => ({
    row: v,
    id: v.id,
    number: v.number,
    clientId: v.clientId,
    clientName,
    projectId: v.projectId,
    projectName,
    issueDate: v.issueDate,
    dueDate: v.dueDate,
    storedStatus: v.status,
    ...invoiceCalc(
      {
        status: v.status,
        dueDate: v.dueDate,
        discountPct: v.discountPct,
        gstRate: v.gstRate,
        lines: linesBy.get(v.id) ?? [],
        payments: paysBy.get(v.id) ?? []
      },
      today
    )
  }));
}

/** Strip the internal row for API responses. */
export const toListItem = ({ row: _row, ...item }: LoadedInvoice): InvoiceListItem => item;

/* ------------------------------------------------------------------- work */

/** Work items (optionally filtered) with names, release version, linked invoice and computed status. */
export async function loadWork(db: Db, where?: SQL, today = todayIso()): Promise<WorkView[]> {
  const rows = await db
    .select({
      work: workItems,
      projectName: projects.name,
      clientId: clients.id,
      clientName: clients.name,
      releaseVersion: releases.version
    })
    .from(workItems)
    .innerJoin(projects, eq(projects.id, workItems.projectId))
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .leftJoin(releases, eq(releases.id, workItems.releaseId))
    .where(where);
  if (!rows.length) return [];
  const linked = db
    .select({ id: workItems.invoiceId })
    .from(workItems)
    .innerJoin(projects, eq(projects.id, workItems.projectId))
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .leftJoin(releases, eq(releases.id, workItems.releaseId))
    .where(where);
  const invs = new Map((await loadInvoices(db, inArray(invoices.id, linked), today)).map(v => [v.id, v]));
  return rows.map(({ work: w, projectName, clientId, clientName, releaseVersion }) => {
    const inv = w.invoiceId ? invs.get(w.invoiceId) : undefined;
    const live = inv && inv.status !== 'Void' ? inv : undefined;
    return {
      ...w,
      clientId,
      clientName,
      projectName,
      releaseVersion,
      invoiceNo: live?.number ?? null,
      invoiceStatus: (live?.status ?? null) as InvoiceStatus | null,
      billablePaise: workAmountPaise(w),
      status: workStatus(w, live?.status ?? null)
    };
  });
}

/* --------------------------------------------------------------- payments */

export async function loadPayments(db: Db, where?: SQL): Promise<PaymentView[]> {
  const rows = await db
    .select({ payment: payments, invoiceNo: invoices.number, clientId: clients.id, clientName: clients.name })
    .from(payments)
    .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
    .innerJoin(clients, eq(clients.id, invoices.clientId))
    .where(where);
  return rows.map(r => ({
    ...r.payment,
    invoiceNo: r.invoiceNo,
    clientId: r.clientId,
    clientName: r.clientName
  }));
}

/* --------------------------------------------------------------- settings */

export async function getSettings(db: Db) {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
  return row ?? null;
}

/** Days in payment terms like "Net 15" (default 15). */
export const termsDays = (terms: string | null | undefined) => {
  const n = parseInt(String(terms ?? '').replace(/\D/g, ''), 10);
  return Number.isFinite(n) && n >= 0 && n <= 365 ? n : 15;
};

/* ------------------------------------------------------------------ utils */

export function groupBy<T, K>(items: readonly T[], key: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const it of items) {
    const k = key(it);
    const list = m.get(k);
    if (list) list.push(it);
    else m.set(k, [it]);
  }
  return m;
}

/** Sort + page an in-memory list (lists whose filters depend on derived status). */
export function paginate<T>(items: T[], page: number, pageSize: number) {
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), total: items.length, page, pageSize };
}

export const compare = (a: string | number | null, b: string | number | null) =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? -1 : 1;
