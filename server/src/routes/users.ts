import { can, userCreateSchema, userUpdateSchema } from '@dsol/shared';
import { asc, eq, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import { inviteUser, listTeam, updateUser } from '../db/repos/admin';
import { notFound } from '../middleware/errors';
import { sendPasswordEmail } from './auth';
import { users } from '../db/schema';
import type { AppEnv } from '../env';
import { requirePermission } from '../middleware/requireRole';
import { validate } from '../middleware/validate';

/**
 * Team members. GET / → active people for pickers ("Released by"); GET /?view=team → everyone
 * with email, status and last login (Team page). Inviting, role changes and deactivation are
 * Admin-only; nothing is ever hard-deleted.
 */
const router = new Hono<AppEnv>()
  .get('/', async c => {
    if (c.req.query('view') === 'team' && can(c.get('user'), 'team.read'))
      return c.json({ items: await listTeam(c.get('db')) });
    const rows = await c
      .get('db')
      .select({ id: users.id, name: users.name, role: users.role, status: users.status })
      .from(users)
      .where(ne(users.status, 'Deactivated'))
      .orderBy(asc(users.name));
    return c.json({ items: rows });
  })
  /** Invite: the person gets an email with a link to set their password (72 hours). */
  .post('/', requirePermission('team.manage'), validate('json', userCreateSchema), async c => {
    const member = await inviteUser(c.get('db'), c.req.valid('json'), c.get('user')!);
    const email = await sendPasswordEmail(c.get('db'), c.env, member, 'invite').catch(() => ({
      status: 'Failed' as const,
      devLink: undefined
    }));
    return c.json({ ...member, passwordEmail: email }, 201);
  })
  /** Send a new set/reset-password link (e.g. the invite expired, or they forgot it). */
  .post('/:id/password-link', requirePermission('team.manage'), async c => {
    const [u] = await c
      .get('db')
      .select()
      .from(users)
      .where(eq(users.id, c.req.param('id')));
    if (!u || u.status === 'Deactivated') throw notFound('User');
    return c.json(await sendPasswordEmail(c.get('db'), c.env, u, u.passwordHash ? 'reset' : 'invite'));
  })
  .patch('/:id', requirePermission('team.manage'), validate('json', userUpdateSchema), async c =>
    c.json(await updateUser(c.get('db'), c.req.param('id'), c.req.valid('json'), c.get('user')!))
  );

export default router;
