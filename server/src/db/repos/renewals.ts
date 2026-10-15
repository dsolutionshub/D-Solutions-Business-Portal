/**
 * The one place renewals, alerts and the daily reminder cron get their projects from.
 * Left out: archived projects, and every project of an archived client (their invoices and
 * payments are unaffected — those stay visible and payable).
 */
import {
  todayIso,
  type IsoDate,
  type ProjectCostAdd,
  type ProjectRenewals,
  type RenewalItem,
  type RenewCreate,
  type RenewResult
} from '@dsol/shared';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { AuthUser } from '../../env';
import { badRequest, notFound } from '../../middleware/errors';
import { renewalItems, renewEntry, type RenewalProject } from '../../services/renewals';
import type { Db } from '../client';
import { newId } from '../ids';
import { auditLog, clients, projectCosts, projects, projectSheet, renewalHistory } from '../schema';
import { rowToSheet } from '../sheetMap';
import { auditEntry, runBatch } from './util';

export async function loadRenewalProjects(db: Db): Promise<RenewalProject[]> {
  const rows = await db
    .select({ project: projects, sheet: projectSheet })
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .innerJoin(projectSheet, eq(projectSheet.projectId, projects.id))
    .where(and(isNull(projects.archivedAt), isNull(clients.archivedAt)));
  if (!rows.length) return [];
  // sub-query, not a list of ids: D1 allows only 100 bound parameters per query
  const costs = await db
    .select()
    .from(projectCosts)
    .where(
      inArray(
        projectCosts.projectId,
        db.select({ id: projects.id }).from(projects).where(isNull(projects.archivedAt))
      )
    );
  return rows.map(({ project, sheet }) => ({
    id: project.id,
    clientId: project.clientId,
    name: project.name,
    archivedAt: project.archivedAt,
    sheet: rowToSheet(sheet),
    costs: costs.filter(c => c.projectId === project.id)
  }));
}

export async function loadRenewalItems(db: Db, today: IsoDate = todayIso()): Promise<RenewalItem[]> {
  return renewalItems(await loadRenewalProjects(db), today);
}

/* ----------------------------------------------------------------- actions */

/** One live project's due items (archived projects / clients have none). */
async function projectItems(db: Db, projectId: string, today = todayIso()) {
  const all = await loadRenewalProjects(db);
  const p = all.find(x => x.id === projectId);
  return p ? renewalItems([p], today) : [];
}

export async function projectRenewals(db: Db, projectId: string): Promise<ProjectRenewals> {
  const [items, history] = await Promise.all([
    projectItems(db, projectId),
    db
      .select()
      .from(renewalHistory)
      .where(eq(renewalHistory.projectId, projectId))
      .orderBy(desc(renewalHistory.renewedOn), desc(renewalHistory.createdAt))
  ]);
  return { items: items.sort((a, b) => a.daysLeft - b.daysLeft), history };
}

const periodText = (n: number, cycle: 'Monthly' | 'Yearly') =>
  cycle === 'Monthly' ? `${n} ${n === 1 ? 'month' : 'months'}` : `${n} ${n === 1 ? 'year' : 'years'}`;

/**
 * Renew a due item: move its sheet date forward by n periods (calendar-safe, month ends clamped)
 * and log it in renewal_history — in one batch. The old alert disappears because its id carries
 * the old date.
 */
export async function renew(
  db: Db,
  projectId: string,
  ref: string,
  input: RenewCreate,
  user: AuthUser
): Promise<RenewResult> {
  const item = (await projectItems(db, projectId)).find(i => i.ref === ref);
  if (!item) throw notFound('Renewal item');
  const change = renewEntry(item, input.periods);
  const historyId = newId('renewal');
  const today = todayIso();
  const sheetSet =
    change.field === 'domain.expiry'
      ? { domainExpiry: change.newDate }
      : change.field === 'domain.sslExpiry'
        ? { domainSslExpiry: change.newDate }
        : change.field === 'hosting.nextBill'
          ? { hostingNextBill: change.newDate }
          : null;
  await runBatch(db, [
    sheetSet
      ? db.update(projectSheet).set(sheetSet).where(eq(projectSheet.projectId, projectId))
      : db
          .update(projectCosts)
          .set({ nextDue: change.newDate })
          .where(
            and(
              eq(projectCosts.id, (change as { costId: string }).costId),
              eq(projectCosts.projectId, projectId)
            )
          ),
    db.insert(renewalHistory).values({
      id: historyId,
      clientId: item.clientId,
      projectId,
      kind: item.kind,
      itemName: item.name,
      renewedOn: today,
      amountPaise: input.amountPaise,
      period: periodText(input.periods, item.cycle),
      renewedBy: user.name,
      reference: input.reference,
      paidVia: input.paidVia
    }),
    db.insert(auditLog).values(
      auditEntry({
        userId: user.id,
        action: 'renewal.renew',
        entity: 'project',
        entityId: projectId,
        meta: { ref, from: item.expiry, to: change.newDate }
      })
    )
  ]);
  const next = (await projectItems(db, projectId)).find(i => i.ref === ref)!;
  const [history] = await db.select().from(renewalHistory).where(eq(renewalHistory.id, historyId));
  return { item: next, history: history! };
}

/** Add a recurring cost to a project's sheet ("Other recurring costs"). */
export async function addCost(db: Db, projectId: string, input: ProjectCostAdd) {
  const [p] = await db
    .select({ id: projects.id, archivedAt: projects.archivedAt })
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!p) throw notFound('Project');
  if (p.archivedAt) throw badRequest('This project is archived. Restore it to add costs.');
  const id = newId('projectCost');
  await db.insert(projectCosts).values({
    id,
    projectId,
    ...input,
    sortOrder: sql`(SELECT coalesce(max(${projectCosts.sortOrder}), -1) + 1 FROM ${projectCosts} WHERE ${projectCosts.projectId} = ${projectId})`
  });
  const [row] = await db.select().from(projectCosts).where(eq(projectCosts.id, id));
  return row!;
}

export async function setDomainAutoRenew(db: Db, projectId: string, on: boolean) {
  const res = await db
    .update(projectSheet)
    .set({ domainAutoRenew: on })
    .where(eq(projectSheet.projectId, projectId))
    .returning({ id: projectSheet.projectId });
  if (!res.length) throw notFound('Project');
}
