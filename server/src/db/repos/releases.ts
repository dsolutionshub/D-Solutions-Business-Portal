import {
  ENV_NAMES,
  formatDate,
  parseSort,
  RELEASE_SORTS,
  type ReleaseBill,
  type ReleaseCreate,
  type ReleaseListResponse,
  type ReleaseUpdate,
  type ReleaseView,
  type releaseListQuerySchema
} from '@dsol/shared';
import { and, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { z } from 'zod';
import { badRequest, HttpError, notFound } from '../../middleware/errors';
import type { Db } from '../client';
import { newId } from '../ids';
import { clients, lists, projects, releaseItems, releases, users, workItems } from '../schema';
import { compare, getSettings, groupBy, loadWork, paginate } from './billing';
import { likePattern, runBatch } from './util';

type ListQuery = z.output<typeof releaseListQuerySchema>;

const OPEN = ['Needs price', 'To bill'];
const UNPAID = ['In draft', 'Invoiced', 'Overdue', 'Part paid'];

/** Releases (filtered) as views: project/client names, items and how they stand in billing. */
async function loadReleases(db: Db, where?: SQL): Promise<ReleaseView[]> {
  const rows = await db
    .select({
      release: releases,
      projectName: projects.name,
      clientId: clients.id,
      clientName: clients.name,
      byName: users.name
    })
    .from(releases)
    .innerJoin(projects, eq(projects.id, releases.projectId))
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .leftJoin(users, eq(users.id, releases.releasedBy))
    .where(where);
  if (!rows.length) return [];
  const ids = db
    .select({ id: releases.id })
    .from(releases)
    .innerJoin(projects, eq(projects.id, releases.projectId))
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .where(where);
  const [items, work] = await Promise.all([
    db
      .select()
      .from(releaseItems)
      .where(inArray(releaseItems.releaseId, ids))
      .orderBy(releaseItems.sortOrder),
    loadWork(db, inArray(workItems.releaseId, ids))
  ]);
  const itemsBy = groupBy(items, i => i.releaseId);
  const workBy = groupBy(work, w => w.releaseId);
  return rows.map(({ release: r, projectName, clientId, clientName, byName }) => {
    const its = itemsBy.get(r.id) ?? [];
    const ws = workBy.get(r.id) ?? [];
    const kind = (k: string) => its.filter(i => i.kind === k).map(i => i.text);
    const features = kind('Feature');
    const fixes = kind('Bug fix');
    const titles = new Set(ws.map(w => w.title));
    return {
      id: r.id,
      projectId: r.projectId,
      projectName,
      clientId,
      clientName,
      version: r.version,
      environment: r.environment,
      releaseDate: r.releaseDate,
      status: r.status,
      releasedBy: r.releasedBy,
      releasedByName: byName,
      mailStatus: r.mailStatus,
      features,
      fixes,
      issues: kind('Known issue'),
      billing: {
        items: features.length + fixes.length,
        added: [...features, ...fixes].filter(t => titles.has(t)).length,
        open: ws.filter(w => OPEN.includes(w.status)).length,
        unpaid: ws.filter(w => UNPAID.includes(w.status)).length,
        paid: ws.filter(w => w.status === 'Paid').length,
        notBillable: ws.filter(w => w.status === 'Not billable').length,
        invoiced: ws.filter(w => w.invoiceNo).length
      },
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    };
  });
}

export async function listReleases(db: Db, q: ListQuery): Promise<ReleaseListResponse> {
  const where: SQL[] = [];
  if (q.client) where.push(eq(clients.id, q.client));
  if (q.project) where.push(eq(projects.id, q.project));
  if (q.env) where.push(eq(releases.environment, q.env));
  if (q.status !== 'all') where.push(eq(releases.status, q.status));
  if (q.q) {
    const p = likePattern(q.q);
    where.push(
      sql`(lower(${releases.version}) LIKE ${p} ESCAPE '\\' OR lower(${projects.name}) LIKE ${p} ESCAPE '\\' OR lower(${clients.name}) LIKE ${p} ESCAPE '\\')`
    );
  }
  const all = await loadReleases(db, where.length ? and(...where) : undefined);
  const sort = parseSort(q.sort, RELEASE_SORTS, { key: 'date', dir: 'desc' });
  const key = (r: ReleaseView) =>
    sort.key === 'date' ? r.releaseDate : sort.key === 'version' ? r.version : r.projectName.toLowerCase();
  all.sort(
    (a, b) => compare(key(a), key(b)) * (sort.dir === 'asc' ? 1 : -1) || compare(b.createdAt, a.createdAt)
  );

  // Summary over every release (not just the filtered ones), like the prototype's cards.
  const everything =
    q.client || q.project || q.env || q.status !== 'all' || q.q ? await loadReleases(db) : all;
  const month = new Date().toISOString().slice(0, 7);
  return {
    ...paginate(all, q.page, q.pageSize),
    summary: {
      thisMonth: everything.filter(r => r.releaseDate.startsWith(month)).length,
      deployedProd: everything.filter(r => r.environment === 'PROD' && r.status === 'Deployed').length,
      failed: everything.filter(r => r.status === 'Failed' || r.status === 'Rolled back').length,
      mailPending: everything.filter(
        r => (r.mailStatus === 'Not sent' && r.status === 'Deployed') || r.mailStatus === 'Scheduled'
      ).length
    }
  };
}

export async function getRelease(db: Db, id: string): Promise<ReleaseView> {
  const [r] = await loadReleases(db, eq(releases.id, id));
  if (!r) throw notFound('Release');
  return r;
}

/* ------------------------------------------------------------------ writes */

async function checkRefs(
  db: Db,
  input: { projectId?: string; environment?: string; releasedBy?: string | null },
  current?: { environment: string }
) {
  if (input.projectId) {
    const [p] = await db
      .select({ archivedAt: projects.archivedAt })
      .from(projects)
      .where(eq(projects.id, input.projectId));
    if (!p) throw badRequest('Select a project.', { projectId: 'Select a project.' });
    if (p.archivedAt)
      throw badRequest('That project is archived.', {
        projectId: 'That project is archived — restore it first.'
      });
  }
  if (input.environment && input.environment !== current?.environment) {
    const [env] = await db
      .select({ v: lists.value })
      .from(lists)
      .where(and(eq(lists.listKey, 'environments'), eq(lists.value, input.environment)));
    if (!env)
      throw badRequest('Unknown environment.', {
        environment: 'Pick an environment from Settings → Dropdown lists.'
      });
  }
  if (input.releasedBy) {
    const [u] = await db.select({ status: users.status }).from(users).where(eq(users.id, input.releasedBy));
    if (!u) throw badRequest('Unknown team member.', { releasedBy: 'Pick a team member.' });
  }
}

function itemRows(releaseId: string, r: { features: string[]; fixes: string[]; issues: string[] }) {
  return [
    ...r.features.map((text, i) => ({
      id: newId('releaseItem'),
      releaseId,
      kind: 'Feature' as const,
      text,
      sortOrder: i
    })),
    ...r.fixes.map((text, i) => ({
      id: newId('releaseItem'),
      releaseId,
      kind: 'Bug fix' as const,
      text,
      sortOrder: i
    })),
    ...r.issues.map((text, i) => ({
      id: newId('releaseItem'),
      releaseId,
      kind: 'Known issue' as const,
      text,
      sortOrder: i
    }))
  ];
}

export async function createRelease(db: Db, input: ReleaseCreate): Promise<string> {
  await checkRefs(db, input);
  const { features, fixes, issues, ...fields } = input;
  const id = newId('release');
  const items = itemRows(id, { features, fixes, issues });
  await runBatch(db, [
    db.insert(releases).values({ id, ...fields }),
    ...(items.length ? [db.insert(releaseItems).values(items)] : [])
  ]);
  return id;
}

export async function updateRelease(db: Db, id: string, input: ReleaseUpdate): Promise<void> {
  const current = await getRelease(db, id);
  await checkRefs(db, input, current);
  const { features, fixes, issues, ...fields } = input;
  const statements: BatchItem<'sqlite'>[] = [];
  if (Object.keys(fields).length) statements.push(db.update(releases).set(fields).where(eq(releases.id, id)));
  if (features || fixes || issues) {
    const items = itemRows(id, {
      features: features ?? current.features,
      fixes: fixes ?? current.fixes,
      issues: issues ?? current.issues
    });
    if (!items.some(i => i.kind !== 'Known issue'))
      throw badRequest('Add at least one feature or bug fix.', {
        features: 'Add at least one feature or bug fix.'
      });
    statements.push(db.delete(releaseItems).where(eq(releaseItems.releaseId, id)));
    if (items.length) statements.push(db.insert(releaseItems).values(items));
  }
  await runBatch(db, statements);
}

/** Refused if any work from this release is on a (non-void) invoice. Other work keeps existing, unlinked. */
export async function deleteRelease(db: Db, id: string) {
  const r = await getRelease(db, id);
  if (r.billing.invoiced)
    throw new HttpError(
      409,
      'invoiced',
      `${r.billing.invoiced} item(s) from ${r.version} are on an invoice. Void that invoice first, or keep the release.`
    );
  await db.delete(releases).where(eq(releases.id, id));
}

export async function markDeployed(db: Db, id: string) {
  await getRelease(db, id);
  await db.update(releases).set({ status: 'Deployed' }).where(eq(releases.id, id));
}

/** Plain-text release notes (prototype "Copy as text"). */
export function releaseNotesText(r: ReleaseView): string {
  const list = (items: string[]) => (items.length ? items.map(x => `- ${x}`).join('\n') : '- None');
  return [
    `${r.projectName} ${r.version}`,
    `${r.clientName} · ${ENV_NAMES[r.environment] ?? r.environment} · ${formatDate(r.releaseDate)}`,
    '',
    'New features:',
    list(r.features),
    '',
    'Bug fixes:',
    list(r.fixes),
    '',
    'Known issues:',
    list(r.issues),
    ''
  ].join('\n');
}

/**
 * Put release items into Billable work. Items already billed from this release (same title)
 * are skipped. Hourly items use the default rate from Settings.
 */
export async function billRelease(
  db: Db,
  id: string,
  input: ReleaseBill
): Promise<{ added: number; skipped: number }> {
  const r = await getRelease(db, id);
  const [existing, s] = await Promise.all([
    db.select({ title: workItems.title }).from(workItems).where(eq(workItems.releaseId, id)),
    getSettings(db)
  ]);
  const have = new Set(existing.map(w => w.title));
  const valid = new Set([...r.features, ...r.fixes]);
  const rows = [];
  let skipped = 0;
  for (const item of input.items) {
    if (!valid.has(item.title)) throw badRequest(`“${item.title}” is not on ${r.version}.`);
    if (have.has(item.title)) {
      skipped++;
      continue;
    }
    have.add(item.title);
    const v = item.value ?? 0;
    rows.push({
      id: newId('workItem'),
      projectId: r.projectId,
      releaseId: r.id,
      type: item.kind,
      title: item.title,
      deliveredOn: r.releaseDate,
      billing: item.billing,
      amountPaise: item.billing === 'Fixed' ? Math.round(v) : 0,
      hours: item.billing === 'Hourly' ? v : 0,
      ratePaise: item.billing === 'Hourly' ? (s?.hourlyRatePaise ?? 0) : 0
    });
  }
  if (rows.length) await db.insert(workItems).values(rows);
  return { added: rows.length, skipped };
}
