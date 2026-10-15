import {
  WORK_FILTERS,
  type WorkFilter,
  type WorkItemCreate,
  type WorkItemUpdate,
  type WorkListResponse,
  type WorkView,
  type workListQuerySchema
} from '@dsol/shared';
import { and, eq, sql, type SQL } from 'drizzle-orm';
import type { z } from 'zod';
import { badRequest, HttpError, notFound } from '../../middleware/errors';
import type { Db } from '../client';
import { newId } from '../ids';
import { clients, projects, releases, workItems } from '../schema';
import { compare, loadWork, paginate } from './billing';
import { likePattern } from './util';

type ListQuery = z.output<typeof workListQuerySchema>;

const OPEN = ['Needs price', 'To bill', 'In draft'];
const BILLED = ['Invoiced', 'Overdue', 'Part paid'];

export const matchesFilter = (w: WorkView, f: WorkFilter) =>
  f === 'all'
    ? true
    : f === 'open'
      ? OPEN.includes(w.status)
      : f === 'billed'
        ? BILLED.includes(w.status)
        : w.status === f;

const sum = (ws: WorkView[]) => ws.reduce((a, w) => a + w.billablePaise, 0);

export async function listWork(db: Db, q: ListQuery): Promise<WorkListResponse> {
  const where: SQL[] = [];
  if (q.client) where.push(eq(clients.id, q.client));
  if (q.project) where.push(eq(projects.id, q.project));
  if (q.release) where.push(eq(workItems.releaseId, q.release));
  if (q.type) where.push(eq(workItems.type, q.type));
  if (q.q) {
    const p = likePattern(q.q);
    where.push(
      sql`(lower(${workItems.title}) LIKE ${p} ESCAPE '\\' OR lower(${projects.name}) LIKE ${p} ESCAPE '\\'
        OR lower(${clients.name}) LIKE ${p} ESCAPE '\\' OR lower(coalesce(${releases.version}, '')) LIKE ${p} ESCAPE '\\')`
    );
  }
  const scoped = await loadWork(db, where.length ? and(...where) : undefined);
  const counts = Object.fromEntries(
    WORK_FILTERS.map(f => [f, scoped.filter(w => matchesFilter(w, f)).length])
  ) as Record<WorkFilter, number>;
  const shown = scoped
    .filter(w => matchesFilter(w, q.status))
    .sort((a, b) => compare(b.deliveredOn, a.deliveredOn) || compare(b.createdAt, a.createdAt));

  // Cards cover all work, whatever the filters (as in the prototype).
  const all = where.length ? await loadWork(db) : scoped;
  const toBill = all.filter(w => w.status === 'To bill');
  const billed = all.filter(w => BILLED.includes(w.status));
  const paid = all.filter(w => w.status === 'Paid');
  return {
    ...paginate(shown, q.page, q.pageSize),
    counts,
    viewTotalPaise: sum(shown),
    summary: {
      toBill: {
        count: toBill.length,
        amountPaise: sum(toBill),
        clients: new Set(toBill.map(w => w.clientId)).size
      },
      needsPrice: { count: all.filter(w => w.status === 'Needs price').length },
      billed: {
        count: billed.length,
        amountPaise: sum(billed),
        overdueCount: billed.filter(w => w.status === 'Overdue').length
      },
      paid: { count: paid.length, amountPaise: sum(paid) },
      notBillable: { count: all.filter(w => w.status === 'Not billable').length }
    }
  };
}

export async function getWork(db: Db, id: string): Promise<WorkView> {
  const [w] = await loadWork(db, eq(workItems.id, id));
  if (!w) throw notFound('Work item');
  return w;
}

async function checkRefs(db: Db, projectId: string, releaseId: string | null | undefined) {
  const [p] = await db
    .select({ archivedAt: projects.archivedAt })
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!p) throw badRequest('Select a project.', { projectId: 'Select a project.' });
  if (p.archivedAt)
    throw badRequest('That project is archived.', {
      projectId: 'That project is archived — restore it first.'
    });
  if (releaseId) {
    const [r] = await db
      .select({ projectId: releases.projectId })
      .from(releases)
      .where(eq(releases.id, releaseId));
    if (!r || r.projectId !== projectId)
      throw badRequest('That release is not from this project.', {
        releaseId: 'Pick a release of this project.'
      });
  }
}

/** Store only the fields that apply to the billing mode. */
const normalise = <T extends Partial<WorkItemCreate>>(w: T): T => ({
  ...w,
  ...(w.billing === 'Fixed' ? { hours: 0, ratePaise: 0 } : {}),
  ...(w.billing === 'Hourly' ? { amountPaise: 0 } : {}),
  ...(w.billing === 'Free' ? { amountPaise: 0, hours: 0, ratePaise: 0 } : {})
});

export async function createWork(db: Db, input: WorkItemCreate): Promise<string> {
  await checkRefs(db, input.projectId, input.releaseId);
  const id = newId('workItem');
  await db.insert(workItems).values({ id, ...normalise(input) });
  return id;
}

/** Editing an invoiced item is allowed (the invoice itself doesn't change — the UI warns). */
export async function updateWork(db: Db, id: string, input: WorkItemUpdate): Promise<void> {
  const current = await getWork(db, id);
  if (input.releaseId !== undefined) await checkRefs(db, current.projectId, input.releaseId);
  await db.update(workItems).set(normalise(input)).where(eq(workItems.id, id));
}

/** Only while it isn't on a (non-void) invoice. */
export async function deleteWork(db: Db, id: string) {
  const w = await getWork(db, id);
  if (w.invoiceNo)
    throw new HttpError(
      409,
      'invoiced',
      `“${w.title}” is on ${w.invoiceNo}. Remove it from that invoice (or void it) first.`
    );
  await db.delete(workItems).where(eq(workItems.id, id));
}

/** Not billable ↔ billable (Fixed; add a price next). */
export async function toggleBillable(db: Db, id: string): Promise<void> {
  const w = await getWork(db, id);
  if (w.invoiceNo)
    throw new HttpError(409, 'invoiced', `“${w.title}” is on ${w.invoiceNo}, so its billing can't change.`);
  await db
    .update(workItems)
    .set(
      w.billing === 'Free'
        ? { billing: 'Fixed' }
        : { billing: 'Free', amountPaise: 0, hours: 0, ratePaise: 0 }
    )
    .where(eq(workItems.id, id));
}
