import {
  can,
  COST_SHEET_FIELDS,
  formatDate,
  formatInr,
  parseSort,
  PROJECT_SORTS,
  SECRET_FIELD_KEYS,
  SHEET_SECTIONS,
  todayIso,
  type ExtraKey,
  type ProjectListItem,
  type ProjectListResponse,
  type projectListQuerySchema,
  type ProjectSave,
  type ProjectSecretStates,
  type ProjectView,
  type SecretFieldKey
} from '@dsol/shared';
import { and, asc, count, desc, eq, gt, isNull, sql, type SQL } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { z } from 'zod';
import { badRequest, HttpError, notFound } from '../../middleware/errors';
import { decryptWithKeys, encrypt, extraKeyAad, secretAad } from '../../services/crypto';
import { annualCostPaise } from '../../services/renewals';
import type { Db } from '../client';
import { newId } from '../ids';
import {
  auditLog,
  clients,
  extraKeys,
  projectCosts,
  projects,
  projectSecrets,
  projectSheet
} from '../schema';
import { rowToSheet, sheetToRow } from '../sheetMap';
import { insertAudit, likePattern, logoUrl, runBatch } from './util';

type ListQuery = z.output<typeof projectListQuerySchema>;

/** Reveals allowed per user per minute (counted from audit_log, so it holds across Worker isolates). */
export const REVEAL_LIMIT_PER_MINUTE = 30;

/* -------------------------------------------------------------------- list */

export async function listProjects(
  db: Db,
  q: ListQuery,
  who: { permissions: readonly string[] }
): Promise<ProjectListResponse> {
  const where: (SQL | undefined)[] = [];
  where.push(isNull(projects.archivedAt));
  if (q.status !== 'all') where.push(eq(projects.status, q.status));
  if (q.client) where.push(eq(projects.clientId, q.client));
  // An archived client's projects stay out of the main list (still listed on that client's page).
  else where.push(isNull(clients.archivedAt));
  if (q.type) where.push(eq(projects.type, q.type));
  if (q.q) {
    const p = likePattern(q.q);
    where.push(
      sql`(lower(${projects.name}) LIKE ${p} ESCAPE '\\' OR lower(${clients.name}) LIKE ${p} ESCAPE '\\'
        OR lower(coalesce(${projects.stack}, '')) LIKE ${p} ESCAPE '\\'
        OR lower(coalesce(${projectSheet.domainName}, '')) LIKE ${p} ESCAPE '\\')`
    );
  }
  const filter = and(...where);
  const sort = parseSort(q.sort, PROJECT_SORTS, { key: 'name', dir: 'asc' });
  const dir = sort.dir === 'asc' ? asc : desc;
  const order = {
    name: [dir(sql`lower(${projects.name})`)],
    client: [dir(sql`lower(${clients.name})`), asc(sql`lower(${projects.name})`)],
    domainExpiry: [sql`${projectSheet.domainExpiry} IS NULL`, dir(projectSheet.domainExpiry)],
    status: [dir(projects.status), asc(sql`lower(${projects.name})`)]
  }[sort.key];

  const base = () =>
    db
      .select()
      .from(projects)
      .innerJoin(clients, eq(clients.id, projects.clientId))
      .leftJoin(projectSheet, eq(projectSheet.projectId, projects.id));
  const [rows, [{ total } = { total: 0 }]] = await Promise.all([
    base()
      .where(filter)
      .orderBy(...order)
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    db
      .select({ total: count() })
      .from(projects)
      .innerJoin(clients, eq(clients.id, projects.clientId))
      .leftJoin(projectSheet, eq(projectSheet.projectId, projects.id))
      .where(filter)
  ]);

  const infra = can(who, 'projects.sheet');
  return {
    items: rows.map(({ projects: p, clients: c, project_sheet: s }): ProjectListItem => ({
      id: p.id,
      name: p.name,
      clientId: c.id,
      clientName: c.name,
      clientColor: c.color,
      clientLogoUrl: logoUrl(c.id, c.logoKey),
      type: p.type,
      status: p.status,
      stack: infra ? p.stack : null,
      environments: p.environments,
      archivedAt: p.archivedAt,
      prodUrl: infra ? (s?.linksProd ?? null) : null,
      domainName: infra ? (s?.domainName ?? null) : null,
      domainExpiry: s?.domainExpiry ?? null,
      hostingPlatform: s?.hostingPlatform ?? null,
      hostingCostPaise: s?.hostingCostPaise ?? null,
      hostingCycle: s?.hostingCycle ?? null,
      dbEngine: infra ? (s?.dbEngine ?? null) : null
    })),
    total,
    page: q.page,
    pageSize: q.pageSize
  };
}

/* ---------------------------------------------------------------- one project */

export async function getProjectRow(db: Db, id: string) {
  const [row] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!row) throw notFound('Project');
  return row;
}

export async function getProjectView(db: Db, id: string): Promise<ProjectView> {
  const project = await getProjectRow(db, id);
  const [[client], [sheetRow], secretRows, keyRows, costRows] = await Promise.all([
    db.select().from(clients).where(eq(clients.id, project.clientId)).limit(1),
    db.select().from(projectSheet).where(eq(projectSheet.projectId, id)).limit(1),
    db
      .select({ fieldKey: projectSecrets.fieldKey, updatedAt: projectSecrets.updatedAt })
      .from(projectSecrets)
      .where(eq(projectSecrets.projectId, id)),
    db.select().from(extraKeys).where(eq(extraKeys.projectId, id)).orderBy(extraKeys.sortOrder),
    db.select().from(projectCosts).where(eq(projectCosts.projectId, id)).orderBy(projectCosts.sortOrder)
  ]);
  if (!client || !sheetRow) throw notFound('Project');

  // Only whether each secret is set — never the value.
  const secrets = Object.fromEntries(
    SECRET_FIELD_KEYS.map(k => {
      const s = secretRows.find(r => r.fieldKey === k);
      return [k, { set: !!s, updatedAt: s?.updatedAt ?? null }];
    })
  ) as ProjectSecretStates;

  const sheet = rowToSheet(sheetRow);
  return {
    access: 'full',
    project,
    client: {
      id: client.id,
      name: client.name,
      color: client.color,
      logoUrl: logoUrl(client.id, client.logoKey),
      archivedAt: client.archivedAt
    },
    sheet,
    secrets,
    extraKeys: keyRows.map((k): ExtraKey => ({
      id: k.id,
      projectId: k.projectId,
      label: k.label,
      isSecret: k.isSecret,
      value: k.isSecret ? null : k.valuePlain,
      hasValue: k.isSecret ? !!k.ciphertext : !!k.valuePlain,
      sortOrder: k.sortOrder,
      createdAt: k.createdAt,
      updatedAt: k.updatedAt
    })),
    costs: costRows,
    annualCostPaise: annualCostPaise(sheet, costRows)
  };
}

/* ------------------------------------------------------------------- writes */

async function assertClientUsable(db: Db, clientId: string) {
  const [client] = await db
    .select({ archivedAt: clients.archivedAt })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) throw badRequest('Select a client.', { 'project.clientId': 'Select a client.' });
  if (client.archivedAt)
    throw badRequest('That client is archived.', {
      'project.clientId': 'That client is archived — restore it first.'
    });
}

/** Encrypt / clear sheet secrets. Omitted keys are untouched; "" clears. */
async function secretStatements(
  db: Db,
  key: string,
  projectId: string,
  secrets: ProjectSave['secrets'],
  userId: string
) {
  const out: BatchItem<'sqlite'>[] = [];
  for (const [fieldKey, value] of Object.entries(secrets) as [SecretFieldKey, string | undefined][]) {
    if (value === undefined) continue;
    if (value === '') {
      out.push(
        db
          .delete(projectSecrets)
          .where(and(eq(projectSecrets.projectId, projectId), eq(projectSecrets.fieldKey, fieldKey)))
      );
      continue;
    }
    const enc = await encrypt(value, key, secretAad(projectId, fieldKey));
    out.push(
      db
        .insert(projectSecrets)
        .values({ projectId, fieldKey, ...enc, updatedBy: userId })
        .onConflictDoUpdate({
          target: [projectSecrets.projectId, projectSecrets.fieldKey],
          set: { ...enc, updatedBy: userId, updatedAt: new Date().toISOString() }
        })
    );
  }
  return out;
}

/** Other keys: full replacement of the list, keeping existing secret values unless retyped. */
async function extraKeyStatements(db: Db, key: string, projectId: string, input: ProjectSave['extraKeys']) {
  const existing = await db.select().from(extraKeys).where(eq(extraKeys.projectId, projectId));
  const byId = new Map(existing.map(k => [k.id, k]));
  const out: BatchItem<'sqlite'>[] = [];
  const keep = new Set<string>();
  const fields: Record<string, string> = {};

  for (const [i, row] of input.entries()) {
    const prev = row.id ? byId.get(row.id) : undefined;
    if (row.id && !prev) throw badRequest('One of the keys no longer exists. Reload the page.');
    const id = prev?.id ?? newId('extraKey');
    keep.add(id);
    const typed = row.value !== undefined && row.value !== '' ? row.value : undefined;
    let values: { valuePlain: string | null; ciphertext: string | null; iv: string | null };

    if (row.isSecret) {
      const plain = typed ?? (prev && !prev.isSecret ? prev.valuePlain : undefined);
      if (plain) values = { valuePlain: null, ...(await encrypt(plain, key, extraKeyAad(projectId, id))) };
      else if (prev?.isSecret && prev.ciphertext)
        values = { valuePlain: null, ciphertext: prev.ciphertext, iv: prev.iv };
      else {
        fields[`extraKeys.${i}.value`] = 'Enter a value.';
        continue;
      }
    } else if (row.value !== undefined)
      values = { valuePlain: row.value || null, ciphertext: null, iv: null };
    else if (prev && !prev.isSecret) values = { valuePlain: prev.valuePlain, ciphertext: null, iv: null };
    else {
      fields[`extraKeys.${i}.value`] = 'Type the value again to store it as a plain key.';
      continue;
    }

    const data = { label: row.label, isSecret: row.isSecret, ...values, sortOrder: i };
    out.push(
      prev
        ? db.update(extraKeys).set(data).where(eq(extraKeys.id, id))
        : db.insert(extraKeys).values({ id, projectId, ...data })
    );
  }
  if (Object.keys(fields).length) throw badRequest('Please fix the highlighted fields.', fields);
  for (const k of existing) if (!keep.has(k.id)) out.push(db.delete(extraKeys).where(eq(extraKeys.id, k.id)));
  return out;
}

/** Recurring costs: full replacement of the list. */
async function costStatements(db: Db, projectId: string, input: ProjectSave['costs']) {
  const existing = await db
    .select({ id: projectCosts.id })
    .from(projectCosts)
    .where(eq(projectCosts.projectId, projectId));
  const ids = new Set(existing.map(c => c.id));
  const out: BatchItem<'sqlite'>[] = [];
  const keep = new Set<string>();
  for (const [i, row] of input.entries()) {
    if (row.id && !ids.has(row.id)) throw badRequest('One of the costs no longer exists. Reload the page.');
    const { id: rowId, ...data } = row;
    const id = rowId ?? newId('projectCost');
    keep.add(id);
    out.push(
      rowId
        ? db
            .update(projectCosts)
            .set({ ...data, sortOrder: i })
            .where(eq(projectCosts.id, id))
        : db.insert(projectCosts).values({ id, projectId, ...data, sortOrder: i })
    );
  }
  for (const c of existing)
    if (!keep.has(c.id)) out.push(db.delete(projectCosts).where(eq(projectCosts.id, c.id)));
  return out;
}

/** Project + sheet + secrets + other keys + costs in ONE D1 batch. */
export async function createProject(
  db: Db,
  key: string,
  input: ProjectSave,
  userId: string
): Promise<string> {
  await assertClientUsable(db, input.project.clientId);
  const id = newId('project');
  const statements: BatchItem<'sqlite'>[] = [
    db.insert(projects).values({ id, ...input.project }),
    db.insert(projectSheet).values(sheetToRow(id, input.sheet)),
    ...(await secretStatements(db, key, id, input.secrets, userId)),
    ...(await extraKeyStatements(db, key, id, input.extraKeys)),
    ...(await costStatements(db, id, input.costs))
  ];
  await runBatch(db, statements);
  return id;
}

export async function updateProject(
  db: Db,
  key: string,
  id: string,
  input: ProjectSave,
  userId: string
): Promise<void> {
  const current = await getProjectRow(db, id);
  if (current.archivedAt) throw new HttpError(409, 'archived', 'Restore this project before editing it.');
  if (input.project.clientId !== current.clientId) await assertClientUsable(db, input.project.clientId);
  const { projectId: _ignored, ...sheet } = sheetToRow(id, input.sheet);
  await runBatch(db, [
    db.update(projects).set(input.project).where(eq(projects.id, id)),
    db
      .update(projectSheet)
      .set({ ...sheet, updatedAt: new Date().toISOString() })
      .where(eq(projectSheet.projectId, id)),
    ...(await secretStatements(db, key, id, input.secrets, userId)),
    ...(await extraKeyStatements(db, key, id, input.extraKeys)),
    ...(await costStatements(db, id, input.costs))
  ]);
}

/* ------------------------------------------------------------------- reveal */

/**
 * Decrypt one secret for display. Rate-limited per user and always audit-logged.
 * `field` is a sheet secret key ("db.password") or "extra:<id>".
 */
export async function revealSecret(
  db: Db,
  keys: readonly string[],
  projectId: string,
  field: string,
  userId: string
): Promise<string> {
  await getProjectRow(db, projectId);
  const since = new Date(Date.now() - 60_000).toISOString();
  const [{ n } = { n: 0 }] = await db
    .select({ n: count() })
    .from(auditLog)
    .where(
      and(eq(auditLog.userId, userId), eq(auditLog.action, 'secret.reveal'), gt(auditLog.createdAt, since))
    );
  if (n >= REVEAL_LIMIT_PER_MINUTE)
    throw new HttpError(
      429,
      'rate_limited',
      'Too many reveals in the last minute. Wait a moment and try again.'
    );

  let value: string;
  let label: string;
  if (field.startsWith('extra:')) {
    const extraId = field.slice(6);
    const [row] = await db
      .select()
      .from(extraKeys)
      .where(and(eq(extraKeys.id, extraId), eq(extraKeys.projectId, projectId)))
      .limit(1);
    if (!row || !row.isSecret || !row.ciphertext || !row.iv) throw notFound('Secret');
    value = await decryptWithKeys(
      { ciphertext: row.ciphertext, iv: row.iv },
      keys,
      extraKeyAad(projectId, extraId)
    );
    label = row.label;
  } else {
    const [row] = await db
      .select()
      .from(projectSecrets)
      .where(and(eq(projectSecrets.projectId, projectId), eq(projectSecrets.fieldKey, field)))
      .limit(1);
    if (!row) throw notFound('Secret');
    value = await decryptWithKeys(row, keys, secretAad(projectId, field));
    label = field;
  }
  await insertAudit(db, {
    userId,
    action: 'secret.reveal',
    entity: 'project',
    entityId: projectId,
    meta: { field, label }
  });
  return value;
}

/* ------------------------------------------------------------------- export */

/** Plain-text project sheet (prototype "Download sheet"). Secret values are always [hidden]. */
export function sheetText(view: ProjectView): string {
  const { project, client, sheet, secrets } = view;
  const money = (p: unknown) => (typeof p === 'number' ? formatInr(p) : '—');
  const lines = [
    `${project.name} — ${client.name}`,
    `Exported ${formatDate(todayIso())} (secrets hidden)`,
    ''
  ];
  for (const s of SHEET_SECTIONS) {
    lines.push('## ' + s.title);
    for (const f of s.fields) {
      if (f.type === 'secret') {
        lines.push(`${f.label}: ${secrets[`${s.key}.${f.key}` as SecretFieldKey]?.set ? '[hidden]' : '—'}`);
        continue;
      }
      const v = (sheet[s.key] as Record<string, unknown>)[f.key];
      lines.push(
        `${f.label}: ${f.type === 'money' ? money(v) : f.type === 'date' ? formatDate(v as string | null) : (v ?? '—')}`
      );
    }
    lines.push('');
  }
  lines.push('## Other keys');
  if (!view.extraKeys.length) lines.push('—');
  for (const k of view.extraKeys) lines.push(`${k.label}: ${k.isSecret ? '[hidden]' : (k.value ?? '—')}`);
  lines.push('', '## Other recurring costs');
  if (!view.costs.length) lines.push('—');
  for (const c of view.costs)
    lines.push(
      `${c.name}: ${formatInr(c.amountPaise)} / ${c.cycle === 'Monthly' ? 'month' : 'year'}${c.nextDue ? ` (next due ${formatDate(c.nextDue)})` : ''}`
    );
  lines.push(
    '',
    '## Running cost',
    `Total per year: ${formatInr(view.annualCostPaise)}`,
    '',
    '## Notes',
    sheet.notes || '—'
  );
  return lines.join('\n') + '\n';
}

/** Projects of a client, sheet-safe (no secrets), for the client JSON export. */
export async function projectsForExport(db: Db, clientId: string) {
  const rows = await db.select({ id: projects.id }).from(projects).where(eq(projects.clientId, clientId));
  const views = await Promise.all(rows.map(r => getProjectView(db, r.id)));
  return views.map(v => ({
    ...v.project,
    sheet: v.sheet,
    secretsSet: Object.entries(v.secrets)
      .filter(([, s]) => s.set)
      .map(([k]) => k),
    extraKeys: v.extraKeys.map(k => ({ label: k.label, value: k.isSecret ? '[hidden]' : k.value })),
    costs: v.costs
  }));
}

/**
 * The project view for roles without the full sheet (Accounts): cost amounts and due dates stay;
 * URLs, logins, keys, database details, the tech stack, notes and other keys are blanked; no secret is
 * reported as set.
 */
export function redactForCosts(view: ProjectView): ProjectView {
  const sheet = { ...view.sheet } as Record<string, unknown>;
  for (const s of SHEET_SECTIONS) {
    const keep = COST_SHEET_FIELDS[s.key] ?? [];
    const section = { ...(view.sheet[s.key] as Record<string, unknown>) };
    for (const k of Object.keys(section))
      if (!keep.includes(k)) section[k] = s.key === 'links' && k === 'prod' ? '' : null;
    if (s.key === 'domain') section.auto = (view.sheet.domain.auto ?? 'Off') as never;
    sheet[s.key] = section;
  }
  sheet.notes = null;
  return {
    ...view,
    access: 'costs',
    // the stack often names the database and services
    project: { ...view.project, stack: null },
    sheet: sheet as ProjectView['sheet'],
    secrets: Object.fromEntries(
      Object.keys(view.secrets).map(k => [k, { set: false, updatedAt: null }])
    ) as ProjectSecretStates,
    extraKeys: []
  };
}
