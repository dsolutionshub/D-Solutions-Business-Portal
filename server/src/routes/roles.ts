import { roleInputSchema, roleUpdateSchema } from '@dsol/shared';
import { Hono } from 'hono';
import { createRole, deleteRole, listRoles, updateRole } from '../db/repos/roles';
import type { AppEnv } from '../env';
import { requirePermission } from '../middleware/requireRole';
import { validate } from '../middleware/validate';

/**
 * Roles: Admin (built in, fixed) and custom roles. Everyone who can see the team sees the roles;
 * creating, editing and deleting roles is Admin-only (team.manage).
 */
const router = new Hono<AppEnv>()
  .get('/', requirePermission('team.read'), async c => c.json({ items: await listRoles(c.get('db')) }))
  .post('/', requirePermission('team.manage'), validate('json', roleInputSchema), async c =>
    c.json(await createRole(c.get('db'), c.req.valid('json'), c.get('user')!), 201)
  )
  .patch('/:id', requirePermission('team.manage'), validate('json', roleUpdateSchema), async c =>
    c.json(await updateRole(c.get('db'), c.req.param('id'), c.req.valid('json'), c.get('user')!))
  )
  .delete('/:id', requirePermission('team.manage'), async c => {
    await deleteRole(c.get('db'), c.req.param('id'), c.get('user')!);
    return c.body(null, 204);
  });

export default router;
