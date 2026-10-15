/** Settings, dropdown lists and team members (Settings and Team & Permissions screens). */
import {
  LIST_KEYS,
  notificationPrefsSchema,
  type ListKey,
  type ListUsage,
  type SettingsUpdate,
  type TeamMember,
  type UserCreate,
  type UserUpdate
} from '@dsol/shared';
import { and, asc, count, eq, ne, sql } from 'drizzle-orm';
import type { AuthUser, Env } from '../../env';
import { badRequest, conflict, forbidden, notFound } from '../../middleware/errors';
import { isDevEmail } from '../../services/email';
import type { Db } from '../client';
import { newId } from '../ids';
import { clients, lists, projects, projectSheet, releases, settings, users } from '../schema';
import { endSessions } from './auth';
import { assignableRole } from './roles';
import { getSettings } from './billing';
import { auditEntry, insertAudit, runBatch } from './util';
import { auditLog } from '../schema';

/* --------------------------------------------------------------- settings */

export async function settingsView(
  db: Db,
  env: Pick<Env, 'ENVIRONMENT' | 'BREVO_API_KEY' | 'EMAIL_FROM_NAME' | 'EMAIL_FROM_ADDRESS'>
) {
  const s = await getSettings(db);
  if (!s) throw notFound('Settings');
  const { id: _id, createdAt: _c, ...rest } = s;
  return {
    ...rest,
    notificationPrefs: notificationPrefsSchema.parse(s.notificationPrefs ?? {}),
    /** what the sender falls back to when the fields are empty */
    emailDefaults: { name: env.EMAIL_FROM_NAME, address: env.EMAIL_FROM_ADDRESS },
    emailDevMode: isDevEmail(env)
  };
}

/**
 * Update company / invoicing / email settings. The next invoice number can only go up — lowering
 * it would hand out numbers that may already exist.
 */
export async function updateSettings(db: Db, patch: SettingsUpdate, userId: string) {
  const s = await getSettings(db);
  if (!s) throw notFound('Settings');
  if (patch.nextInvoiceNo !== undefined && patch.nextInvoiceNo < s.nextInvoiceNo)
    throw badRequest('Please fix the highlighted fields.', {
      nextInvoiceNo: `It can only go up — the next number is already ${s.nextInvoiceNo}.`
    });
  await runBatch(db, [
    db.update(settings).set(patch).where(eq(settings.id, 1)),
    db.insert(auditLog).values(
      auditEntry({
        userId,
        action: 'settings.update',
        entity: 'settings',
        entityId: '1',
        meta: { fields: Object.keys(patch) }
      })
    )
  ]);
}

/* ------------------------------------------------------------------ lists */

export const isListKey = (k: string): k is ListKey => (LIST_KEYS as readonly string[]).includes(k);

/** Environment codes are upper-cased letters, digits and dashes (e.g. UAT). */
export const normaliseListValue = (key: ListKey, value: string) =>
  key === 'environments' ? value.toUpperCase().replace(/[^A-Z0-9-]/g, '') : value.trim().replace(/\s+/g, ' ');

async function listValues(db: Db, key: ListKey) {
  return db
    .select()
    .from(lists)
    .where(eq(lists.listKey, key))
    .orderBy(asc(lists.sortOrder), asc(lists.value));
}

export async function addListValue(db: Db, key: ListKey, raw: string, userId: string) {
  const value = normaliseListValue(key, raw);
  if (!value) throw badRequest('Please fix the highlighted fields.', { value: 'Type a value first.' });
  const existing = await listValues(db, key);
  const dup = existing.find(v => v.value.toLowerCase() === value.toLowerCase());
  if (dup)
    throw conflict(`${dup.value} is already in the list.`, { value: `${dup.value} is already in the list.` });
  await runBatch(db, [
    db.insert(lists).values({ id: newId('listValue'), listKey: key, value, sortOrder: existing.length }),
    db
      .insert(auditLog)
      .values(auditEntry({ userId, action: 'list.add', entity: 'list', entityId: key, meta: { value } }))
  ]);
  return (await listValues(db, key)).map(v => v.value);
}

/** Remove a value from a dropdown. Records that use it keep it (they store the text). */
export async function removeListValue(db: Db, key: ListKey, value: string, userId: string) {
  const res = await db
    .delete(lists)
    .where(and(eq(lists.listKey, key), eq(lists.value, value)))
    .returning({ id: lists.id });
  if (!res.length) throw notFound('List value');
  await insertAudit(db, { userId, action: 'list.remove', entity: 'list', entityId: key, meta: { value } });
  return (await listValues(db, key)).map(v => v.value);
}

/** New order: must be exactly the current values. */
export async function reorderList(db: Db, key: ListKey, values: string[]) {
  const current = await listValues(db, key);
  const now = new Set(current.map(v => v.value));
  if (
    values.length !== current.length ||
    new Set(values).size !== values.length ||
    values.some(v => !now.has(v))
  )
    throw conflict('The list changed meanwhile. Reload and try again.');
  await runBatch(
    db,
    values.map((v, i) =>
      db
        .update(lists)
        .set({ sortOrder: i })
        .where(and(eq(lists.listKey, key), eq(lists.value, v)))
    )
  );
  return values;
}

/** How many records use a value (shown before removing it). */
export async function listUsage(db: Db, key: ListKey, value: string): Promise<ListUsage> {
  const n = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
  const parts: [string, number][] = [];
  switch (key) {
    case 'environments':
      parts.push([
        'project',
        await n(
          db
            .select({ n: count() })
            .from(projects)
            .where(
              sql`EXISTS (SELECT 1 FROM json_each(${projects.environments}) WHERE json_each.value = ${value})`
            )
        )
      ]);
      parts.push([
        'release',
        await n(db.select({ n: count() }).from(releases).where(eq(releases.environment, value)))
      ]);
      break;
    case 'hosting':
      parts.push([
        'project',
        await n(db.select({ n: count() }).from(projectSheet).where(eq(projectSheet.hostingPlatform, value)))
      ]);
      break;
    case 'registrar':
      parts.push([
        'project',
        await n(db.select({ n: count() }).from(projectSheet).where(eq(projectSheet.domainRegistrar, value)))
      ]);
      break;
    case 'database':
      parts.push([
        'project',
        await n(db.select({ n: count() }).from(projectSheet).where(eq(projectSheet.dbEngine, value)))
      ]);
      break;
    case 'payGateway':
      parts.push([
        'project',
        await n(db.select({ n: count() }).from(projectSheet).where(eq(projectSheet.keysPayGateway, value)))
      ]);
      break;
    case 'projectType':
      parts.push([
        'project',
        await n(db.select({ n: count() }).from(projects).where(eq(projects.type, value)))
      ]);
      break;
    case 'businessType':
      parts.push(['client', await n(db.select({ n: count() }).from(clients).where(eq(clients.type, value)))]);
      break;
    case 'industry':
      parts.push([
        'client',
        await n(db.select({ n: count() }).from(clients).where(eq(clients.industry, value)))
      ]);
      break;
    case 'state':
      parts.push([
        'client',
        await n(db.select({ n: count() }).from(clients).where(eq(clients.state, value)))
      ]);
      break;
  }
  const used = parts.filter(([, c]) => c > 0);
  return {
    count: used.reduce((a, [, c]) => a + c, 0),
    detail: used.map(([what, c]) => `${c} ${what}${c === 1 ? '' : 's'}`).join(', ')
  };
}

/* ------------------------------------------------------------------- team */

const teamColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
  status: users.status,
  lastLoginAt: users.lastLoginAt,
  createdAt: users.createdAt
};

export async function listTeam(db: Db): Promise<TeamMember[]> {
  return db.select(teamColumns).from(users).orderBy(asc(users.name));
}

/** Invite: the user can sign in (through Cloudflare Access) once added; status turns Active on first sign-in. */
export async function inviteUser(db: Db, input: UserCreate, by: AuthUser): Promise<TeamMember> {
  const [dup] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email));
  if (dup) throw conflict('This user already exists.', { email: 'This user already exists.' });
  const role = await assignableRole(db, input.role);
  const id = newId('user');
  await runBatch(db, [
    db.insert(users).values({ id, email: input.email, name: input.name, role, status: 'Invited' }),
    db.insert(auditLog).values(
      auditEntry({
        userId: by.id,
        action: 'user.invite',
        entity: 'user',
        entityId: id,
        meta: { role: input.role }
      })
    )
  ]);
  const [row] = await db.select(teamColumns).from(users).where(eq(users.id, id));
  return row!;
}

const activeAdmins = async (db: Db, except: string) =>
  (
    await db
      .select({ n: count() })
      .from(users)
      .where(and(eq(users.role, 'Admin'), ne(users.status, 'Deactivated'), ne(users.id, except)))
  )[0]?.n ?? 0;

/**
 * Change name / role / active status. Rules: nobody changes their own role or deactivates
 * themselves, and there is always at least one active Admin.
 */
export async function updateUser(db: Db, id: string, patch: UserUpdate, by: AuthUser): Promise<TeamMember> {
  const [u] = await db.select().from(users).where(eq(users.id, id));
  if (!u) throw notFound('User');
  const self = u.id === by.id;
  if (self && patch.role && patch.role !== u.role)
    throw forbidden('You can’t change your own role. Ask another Admin.');
  if (self && patch.status === 'Deactivated') throw forbidden('You can’t deactivate yourself.');

  const losingAdmin =
    u.role === 'Admin' &&
    u.status !== 'Deactivated' &&
    ((patch.role && patch.role !== 'Admin') || patch.status === 'Deactivated');
  if (losingAdmin && (await activeAdmins(db, u.id)) === 0)
    throw conflict('There must always be at least one active Admin. Make someone else an Admin first.');

  // the role must exist; reactivating someone whose role was removed needs a new role too
  if (patch.role) patch = { ...patch, role: await assignableRole(db, patch.role) };
  else if (patch.status === 'Active' && u.status === 'Deactivated')
    await assignableRole(db, u.role).catch(() => {
      throw badRequest(`Their role “${u.role}” no longer exists. Give them a role first.`, {
        role: 'Pick a role.'
      });
    });

  const set: Partial<typeof users.$inferInsert> = {};
  if (patch.name) set.name = patch.name;
  if (patch.role) set.role = patch.role;
  if (patch.status === 'Deactivated') set.status = 'Deactivated';
  // reactivating: back to Active if they have signed in before, else still Invited
  if (patch.status === 'Active' && u.status === 'Deactivated')
    set.status = u.lastLoginAt ? 'Active' : 'Invited';

  const audits = [];
  if (patch.role && patch.role !== u.role)
    audits.push(
      auditEntry({
        userId: by.id,
        action: 'user.role_change',
        entity: 'user',
        entityId: id,
        meta: { from: u.role, to: patch.role }
      })
    );
  if (set.status === 'Deactivated' && u.status !== 'Deactivated')
    audits.push(auditEntry({ userId: by.id, action: 'user.deactivate', entity: 'user', entityId: id }));
  if (patch.status === 'Active' && u.status === 'Deactivated')
    audits.push(auditEntry({ userId: by.id, action: 'user.reactivate', entity: 'user', entityId: id }));

  if (Object.keys(set).length)
    await runBatch(db, [
      db.update(users).set(set).where(eq(users.id, id)),
      ...audits.map(a => db.insert(auditLog).values(a))
    ]);
  // deactivated: signed out everywhere at once
  if (set.status === 'Deactivated') await endSessions(db, id);
  const [row] = await db.select(teamColumns).from(users).where(eq(users.id, id));
  return row!;
}

/* ----------------------------------------------------------------- export */

/**
 * Everything as JSON, for backups and moving data. Secret values are never decrypted: secret
 * fields and secret "other keys" appear as "[hidden]", and ciphertext / IVs are left out.
 */
export async function exportAll(db: Db, userId: string) {
  const t = await import('../schema');
  const [secretRows, extraRows] = await Promise.all([
    db.select().from(t.projectSecrets),
    db.select().from(t.extraKeys)
  ]);
  const out = {
    exportedAt: new Date().toISOString(),
    note: 'Secret values are hidden. Amounts are in paise (₹1 = 100).',
    settings: await db.select().from(t.settings),
    users: await db.select(teamColumns).from(t.users),
    lists: await db.select().from(t.lists),
    clients: await db.select().from(t.clients),
    contacts: await db.select().from(t.contacts),
    projects: await db.select().from(t.projects),
    projectSheets: await db.select().from(t.projectSheet),
    projectSecrets: secretRows.map(s => ({
      projectId: s.projectId,
      field: s.fieldKey,
      value: '[hidden]',
      updatedAt: s.updatedAt
    })),
    extraKeys: extraRows.map(k => ({
      id: k.id,
      projectId: k.projectId,
      label: k.label,
      isSecret: k.isSecret,
      value: k.isSecret ? '[hidden]' : k.valuePlain
    })),
    projectCosts: await db.select().from(t.projectCosts),
    releases: await db.select().from(t.releases),
    releaseItems: await db.select().from(t.releaseItems),
    workItems: await db.select().from(t.workItems),
    invoices: await db.select().from(t.invoices),
    invoiceLines: await db.select().from(t.invoiceLines),
    payments: await db.select().from(t.payments),
    renewalHistory: await db.select().from(t.renewalHistory),
    notices: await db.select().from(t.notices),
    emailTemplates: await db.select().from(t.emailTemplates),
    emails: await db.select().from(t.emails)
  };
  await insertAudit(db, { userId, action: 'data.export', entity: 'all', entityId: '-' });
  return out;
}
