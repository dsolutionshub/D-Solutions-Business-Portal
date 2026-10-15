/**
 * Roles: the built-in Admin (every permission, fixed) and custom roles an Admin creates. Users refer to a role by name, so renaming a role renames it on its users as well.
 */
import {
  BUILTIN_ROLE_PERMISSIONS,
  BUILTIN_ROLES,
  cleanPermissions,
  isBuiltinRole,
  type Permission,
  type Role,
  type RoleInput,
  type RoleUpdate,
  type RoleView
} from '@dsol/shared';
import { and, count, eq, ne, sql } from 'drizzle-orm';
import type { AuthUser } from '../../env';
import { badRequest, conflict, notFound } from '../../middleware/errors';
import type { Db } from '../client';
import { newId } from '../ids';
import { auditLog, roles, users } from '../schema';
import { auditEntry, runBatch } from './util';

const byName = (name: string) => sql`lower(${roles.name}) = lower(${name})`;

/** What a role allows. Unknown roles (e.g. one that was deleted) allow nothing. */
export async function permissionsFor(db: Db, role: Role): Promise<Permission[]> {
  if (isBuiltinRole(role)) return [...BUILTIN_ROLE_PERMISSIONS[role]];
  const [r] = await db.select({ permissions: roles.permissions }).from(roles).where(byName(role)).limit(1);
  return r ? cleanPermissions(r.permissions) : [];
}

/** The stored spelling of a role that can be given to someone, or a 400 if there is no such role. */
export async function assignableRole(db: Db, role: Role, field = 'role'): Promise<Role> {
  if (isBuiltinRole(role)) return role;
  const [r] = await db.select({ name: roles.name }).from(roles).where(byName(role)).limit(1);
  if (!r) throw badRequest('That role doesn’t exist.', { [field]: 'That role doesn’t exist.' });
  return r.name;
}

/** People on a role who still have access (not deactivated). */
const membersOf = async (db: Db, name: string) =>
  (
    await db
      .select({ n: count() })
      .from(users)
      .where(and(sql`lower(${users.role}) = lower(${name})`, ne(users.status, 'Deactivated')))
  )[0]?.n ?? 0;

export async function listRoles(db: Db): Promise<RoleView[]> {
  const [custom, counts] = await Promise.all([
    db
      .select()
      .from(roles)
      .orderBy(sql`lower(${roles.name})`),
    db
      .select({ role: users.role, n: count() })
      .from(users)
      .where(ne(users.status, 'Deactivated'))
      .groupBy(users.role)
  ]);
  const members = (name: string) =>
    counts.filter(c => c.role.toLowerCase() === name.toLowerCase()).reduce((a, c) => a + c.n, 0);
  return [
    ...BUILTIN_ROLES.map(name => ({
      id: null,
      name,
      builtin: true,
      permissions: [...BUILTIN_ROLE_PERMISSIONS[name]],
      members: members(name)
    })),
    ...custom.map(r => ({
      id: r.id,
      name: r.name,
      builtin: false,
      permissions: cleanPermissions(r.permissions),
      members: members(r.name)
    }))
  ];
}

async function assertNameFree(db: Db, name: string, except?: string) {
  const [dup] = await db.select({ id: roles.id }).from(roles).where(byName(name)).limit(1);
  if (dup && dup.id !== except)
    throw conflict('A role with this name already exists.', {
      name: 'A role with this name already exists.'
    });
}

export async function createRole(db: Db, input: RoleInput, by: AuthUser): Promise<RoleView> {
  await assertNameFree(db, input.name);
  const id = newId('role');
  await runBatch(db, [
    db.insert(roles).values({ id, name: input.name, permissions: input.permissions }),
    db.insert(auditLog).values(
      auditEntry({
        userId: by.id,
        action: 'role.create',
        entity: 'role',
        entityId: id,
        meta: { name: input.name }
      })
    )
  ]);
  return (await listRoles(db)).find(r => r.id === id)!;
}

export async function updateRole(db: Db, id: string, patch: RoleUpdate, by: AuthUser): Promise<RoleView> {
  const [r] = await db.select().from(roles).where(eq(roles.id, id));
  if (!r) throw notFound('Role');
  const renamed = patch.name !== undefined && patch.name !== r.name;
  if (renamed) await assertNameFree(db, patch.name!, id);
  await runBatch(db, [
    db
      .update(roles)
      .set({ name: patch.name ?? r.name, permissions: patch.permissions ?? r.permissions })
      .where(eq(roles.id, id)),
    // people keep their role through a rename (deactivated ones too)
    ...(renamed
      ? [
          db
            .update(users)
            .set({ role: patch.name! })
            .where(sql`lower(${users.role}) = lower(${r.name})`)
        ]
      : []),
    db.insert(auditLog).values(
      auditEntry({
        userId: by.id,
        action: 'role.update',
        entity: 'role',
        entityId: id,
        meta: { name: patch.name ?? r.name, ...(renamed ? { from: r.name } : {}) }
      })
    )
  ]);
  return (await listRoles(db)).find(x => x.id === id)!;
}

/** Only a role nobody (active or invited) has can be deleted. */
export async function deleteRole(db: Db, id: string, by: AuthUser): Promise<void> {
  const [r] = await db.select().from(roles).where(eq(roles.id, id));
  if (!r) throw notFound('Role');
  const n = await membersOf(db, r.name);
  if (n)
    throw conflict(`${n} ${n === 1 ? 'person has' : 'people have'} this role. Give them another role first.`);
  await runBatch(db, [
    db.delete(roles).where(eq(roles.id, id)),
    db.insert(auditLog).values(
      auditEntry({
        userId: by.id,
        action: 'role.delete',
        entity: 'role',
        entityId: id,
        meta: { name: r.name }
      })
    )
  ]);
}
