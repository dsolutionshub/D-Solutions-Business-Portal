import {
  formatInr,
  parseSort,
  todayIso,
  CLIENT_SORTS,
  type ClientCreate,
  type ClientListItem,
  type ClientListResponse,
  type ClientUpdate,
  type ClientView,
  type clientListQuerySchema
} from '@dsol/shared';
import type { z } from 'zod';
import { and, asc, count, desc, eq, isNotNull, isNull, ne, sql, type SQL } from 'drizzle-orm';
import { conflict, HttpError, notFound } from '../../middleware/errors';
import type { Db } from '../client';
import { newId } from '../ids';
import {
  clients,
  contacts,
  emails,
  invoices,
  projects,
  releases,
  renewalHistory,
  workItems
} from '../schema';
import { unpaidInvoicesForClient } from './invoices';
import { insertAudit, likePattern, logoUrl, runBatch } from './util';

type ListQuery = z.output<typeof clientListQuerySchema>;

/** Colours for new clients' initials badges (same palette as the prototype). */
const PALETTE = ['#4F46E5', '#0E7490', '#7C3AED', '#B45309', '#0F766E', '#BE185D'];

/* -------------------------------------------------------- computed columns */

const activeProjectsSql = sql<number>`(SELECT count(*) FROM projects p
  WHERE p.client_id = ${clients.id} AND p.archived_at IS NULL AND p.status <> 'Completed')`;

/** Next domain expiry: the earliest upcoming one, else the oldest expired one (as in the prototype). */
const domainOrder = (today: string) =>
  sql`FROM project_sheet s JOIN projects p ON p.id = s.project_id
      WHERE p.client_id = ${clients.id} AND p.archived_at IS NULL
        AND s.domain_name IS NOT NULL AND s.domain_expiry IS NOT NULL
      ORDER BY (s.domain_expiry < ${today}), s.domain_expiry LIMIT 1`;
const nextExpirySql = (today: string) => sql<string | null>`(SELECT s.domain_expiry ${domainOrder(today)})`;
const nextDomainSql = (today: string) => sql<string | null>`(SELECT s.domain_name ${domainOrder(today)})`;

const primaryJoin = and(eq(contacts.clientId, clients.id), eq(contacts.tag, 'Primary'));

/* -------------------------------------------------------------------- list */

export async function listClients(db: Db, q: ListQuery): Promise<ClientListResponse> {
  const today = todayIso();
  const where: (SQL | undefined)[] = [];
  if (q.status === 'Archived') where.push(isNotNull(clients.archivedAt));
  else {
    where.push(isNull(clients.archivedAt));
    if (q.status !== 'all') where.push(eq(clients.status, q.status));
  }
  if (q.industry) where.push(eq(clients.industry, q.industry));
  if (q.q) {
    const p = likePattern(q.q);
    where.push(
      sql`(lower(${clients.name}) LIKE ${p} ESCAPE '\\' OR lower(coalesce(${contacts.name}, '')) LIKE ${p} ESCAPE '\\'
        OR lower(coalesce(${contacts.email}, '')) LIKE ${p} ESCAPE '\\' OR lower(${clients.website}) LIKE ${p} ESCAPE '\\')`
    );
  }
  const filter = and(...where);

  const sort = parseSort(q.sort, CLIENT_SORTS, { key: 'name', dir: 'asc' });
  const dir = sort.dir === 'asc' ? asc : desc;
  const expiry = nextExpirySql(today);
  const order = {
    name: [dir(sql`lower(${clients.name})`)],
    projects: [dir(activeProjectsSql), asc(sql`lower(${clients.name})`)],
    // clients without a domain go last either way
    domainExpiry: [sql`${expiry} IS NULL`, dir(expiry)],
    status: [dir(clients.status), asc(sql`lower(${clients.name})`)]
  }[sort.key];

  const [rows, [{ total } = { total: 0 }], [summary], industries] = await Promise.all([
    db
      .select({
        id: clients.id,
        name: clients.name,
        color: clients.color,
        logoKey: clients.logoKey,
        website: clients.website,
        industry: clients.industry,
        status: clients.status,
        archivedAt: clients.archivedAt,
        contactName: contacts.name,
        contactEmail: contacts.email,
        contactPhone: contacts.phone,
        activeProjects: activeProjectsSql,
        nextDomainExpiry: expiry,
        nextDomainName: nextDomainSql(today)
      })
      .from(clients)
      .leftJoin(contacts, primaryJoin)
      .where(filter)
      .orderBy(...order)
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    db.select({ total: count() }).from(clients).leftJoin(contacts, primaryJoin).where(filter),
    db
      .select({
        total: sql<number>`sum(${clients.archivedAt} IS NULL)`,
        active: sql<number>`sum(${clients.archivedAt} IS NULL AND ${clients.status} = 'Active')`,
        inactive: sql<number>`sum(${clients.archivedAt} IS NULL AND ${clients.status} = 'Inactive')`,
        archived: sql<number>`sum(${clients.archivedAt} IS NOT NULL)`
      })
      .from(clients),
    db
      .selectDistinct({ industry: clients.industry })
      .from(clients)
      .where(and(isNull(clients.archivedAt), isNotNull(clients.industry)))
      .orderBy(clients.industry)
  ]);

  return {
    items: rows.map(({ logoKey, ...r }): ClientListItem => ({ ...r, logoUrl: logoUrl(r.id, logoKey) })),
    total,
    page: q.page,
    pageSize: q.pageSize,
    summary: {
      total: summary?.total ?? 0,
      active: summary?.active ?? 0,
      inactive: summary?.inactive ?? 0,
      archived: summary?.archived ?? 0
    },
    industries: industries.map(i => i.industry!).filter(Boolean)
  };
}

/* ---------------------------------------------------------------- one client */

export async function getClientRow(db: Db, id: string) {
  const [row] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  if (!row) throw notFound('Client');
  return row;
}

export async function getClientView(db: Db, id: string): Promise<ClientView> {
  const row = await getClientRow(db, id);
  const [contactRows, [counts]] = await Promise.all([
    db.select().from(contacts).where(eq(contacts.clientId, id)),
    db
      .select({
        projects: sql<number>`count(*)`,
        activeProjects: sql<number>`coalesce(sum(${projects.status} <> 'Completed'), 0)`
      })
      .from(projects)
      .where(and(eq(projects.clientId, id), isNull(projects.archivedAt)))
  ]);
  const { logoKey, ...client } = row;
  return {
    ...client,
    currency: 'INR',
    logoUrl: logoUrl(id, logoKey),
    primaryContact: contactRows.find(c => c.tag === 'Primary') ?? null,
    counts: {
      projects: counts?.projects ?? 0,
      activeProjects: counts?.activeProjects ?? 0,
      contacts: contactRows.length
    }
  };
}

async function assertUniqueName(db: Db, name: string, exceptId?: string) {
  const [dupe] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(
      and(
        sql`lower(${clients.name}) = ${name.toLowerCase()}`,
        exceptId ? ne(clients.id, exceptId) : undefined
      )
    )
    .limit(1);
  if (dupe)
    throw conflict('A client with this name already exists.', {
      name: 'A client with this name already exists.'
    });
}

/* ------------------------------------------------------------------- writes */

export async function createClient(db: Db, input: ClientCreate): Promise<string> {
  await assertUniqueName(db, input.name);
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(clients);
  const id = newId('client');
  const { primaryContact, ...fields } = input;
  await runBatch(db, [
    db.insert(clients).values({ id, ...fields, color: PALETTE[n % PALETTE.length]! }),
    db.insert(contacts).values({
      id: newId('contact'),
      clientId: id,
      ...primaryContact,
      tag: 'Primary',
      notifyReleases: true
    })
  ]);
  return id;
}

export async function updateClient(db: Db, id: string, input: ClientUpdate): Promise<void> {
  const current = await getClientRow(db, id);
  if (current.archivedAt) throw new HttpError(409, 'archived', 'Restore this client before editing it.');
  if (input.name !== undefined) await assertUniqueName(db, input.name, id);
  const { primaryContact, ...fields } = input;
  const statements = [];
  if (Object.keys(fields).length) statements.push(db.update(clients).set(fields).where(eq(clients.id, id)));
  if (primaryContact) {
    const [primary] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.clientId, id), eq(contacts.tag, 'Primary')))
      .limit(1);
    statements.push(
      primary
        ? db.update(contacts).set(primaryContact).where(eq(contacts.id, primary.id))
        : db.insert(contacts).values({
            id: newId('contact'),
            clientId: id,
            ...primaryContact,
            tag: 'Primary',
            notifyReleases: true
          })
    );
  }
  await runBatch(db, statements);
}

/** Soft delete. Refused while the client has unpaid issued invoices. */
export async function archiveClient(db: Db, id: string, userId: string): Promise<void> {
  const client = await getClientRow(db, id);
  if (client.archivedAt) return;
  const unpaid = await unpaidInvoicesForClient(db, id);
  if (unpaid.length) {
    const due = unpaid.reduce((sum, v) => sum + v.balancePaise, 0);
    throw new HttpError(
      409,
      'unpaid_invoices',
      `${client.name} has ${unpaid.length} unpaid invoice${unpaid.length === 1 ? '' : 's'} (${formatInr(due)} due: ${unpaid
        .map(v => v.number)
        .join(', ')}). Record the payments or void them before archiving.`
    );
  }
  await runBatch(db, [
    db.update(clients).set({ archivedAt: new Date().toISOString() }).where(eq(clients.id, id)),
    insertAudit(db, { userId, action: 'client.archive', entity: 'client', entityId: id })
  ]);
}

export async function restoreClient(db: Db, id: string, userId: string): Promise<void> {
  const client = await getClientRow(db, id);
  if (!client.archivedAt) return;
  await assertUniqueName(db, client.name, id);
  await runBatch(db, [
    db.update(clients).set({ archivedAt: null }).where(eq(clients.id, id)),
    insertAudit(db, { userId, action: 'client.restore', entity: 'client', entityId: id })
  ]);
}

/**
 * Permanent delete of an ARCHIVED client with everything that belongs to it: projects (sheets,
 * secrets, keys, costs), releases, delivered work, renewal history, emails and contacts.
 * Refused while the client has invoices: those are financial records and are kept.
 * Returns the logo key so the caller can remove the file.
 */
export async function deleteClient(db: Db, id: string, userId: string): Promise<string | null> {
  const client = await getClientRow(db, id);
  if (!client.archivedAt)
    throw new HttpError(
      409,
      'not_archived',
      'Archive the client first; only archived clients can be deleted.'
    );
  const [inv] = await db.select({ n: count() }).from(invoices).where(eq(invoices.clientId, id));
  if (inv?.n)
    throw new HttpError(
      409,
      'has_invoices',
      `${client.name} has ${inv.n} invoice${inv.n === 1 ? '' : 's'}. Invoices are financial records and are kept, so this client can’t be deleted (it stays archived).`
    );
  const projectIds = db.select({ id: projects.id }).from(projects).where(eq(projects.clientId, id));
  await runBatch(db, [
    db.delete(emails).where(eq(emails.clientId, id)),
    db.delete(renewalHistory).where(eq(renewalHistory.clientId, id)),
    db.delete(workItems).where(sql`${workItems.projectId} IN ${projectIds}`),
    db.delete(releases).where(sql`${releases.projectId} IN ${projectIds}`),
    // sheets, secrets, extra keys and costs go with their project (ON DELETE CASCADE)
    db.delete(projects).where(eq(projects.clientId, id)),
    // contacts go with the client (ON DELETE CASCADE)
    db.delete(clients).where(eq(clients.id, id)),
    insertAudit(db, {
      userId,
      action: 'client.delete',
      entity: 'client',
      entityId: id,
      meta: { name: client.name }
    })
  ]);
  return client.logoKey;
}

export async function setClientLogo(db: Db, id: string, logoKey: string | null) {
  await db.update(clients).set({ logoKey }).where(eq(clients.id, id));
}
