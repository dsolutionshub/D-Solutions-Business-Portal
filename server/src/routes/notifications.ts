import { alertListQuerySchema, noticeCreateSchema, notificationPrefsUpdateSchema } from '@dsol/shared';
import { Hono } from 'hono';
import {
  alertsForUser,
  createNotice,
  deleteNotice,
  getPrefs,
  listNotices,
  markAllRead,
  restoreDismissed,
  setAlertState,
  updatePrefs
} from '../db/repos/alerts';
import type { AppEnv } from '../env';
import { badRequest } from '../middleware/errors';
import { requirePermission } from '../middleware/requireRole';
import { validate } from '../middleware/validate';

/**
 * /api/alerts — computed alerts for the signed-in user (bell + inbox), and their read / dismissed
 * state. Alert ids contain ":" — encode them in the URL.
 */
export const alerts = new Hono<AppEnv>()
  .use(requirePermission('alerts.read'))
  .get('/', validate('query', alertListQuerySchema), async c =>
    c.json(await alertsForUser(c.get('db'), c.get('user')!, c.req.valid('query')))
  )
  .post('/read-all', async c => c.json({ updated: await markAllRead(c.get('db'), c.get('user')!) }))
  .post('/restore-dismissed', async c =>
    c.json({ restored: await restoreDismissed(c.get('db'), c.get('user')!.id) })
  )
  .post('/:id/:action{read|unread|dismiss}', async c => {
    const id = c.req.param('id');
    if (id.length > 200) throw badRequest('Unknown alert.');
    await setAlertState(
      c.get('db'),
      c.get('user')!.id,
      id,
      c.req.param('action') as 'read' | 'unread' | 'dismiss'
    );
    return c.json({ ok: true });
  });

/** /api/notices — manual notices, e.g. an upcoming maintenance window. */
export const notices = new Hono<AppEnv>()
  .get('/', async c => c.json({ items: await listNotices(c.get('db')) }))
  .post('/', requirePermission('notices.write'), validate('json', noticeCreateSchema), async c =>
    c.json(await createNotice(c.get('db'), c.req.valid('json'), c.get('user')!.id), 201)
  )
  .delete('/:id', requirePermission('notices.write'), async c => {
    await deleteNotice(c.get('db'), c.req.param('id'));
    return c.body(null, 204);
  });

/** /api/notification-prefs — reminder days and channels per alert type (one set for the team). */
export const prefs = new Hono<AppEnv>()
  .get('/', async c => c.json(await getPrefs(c.get('db'))))
  .patch('/', requirePermission('settings.write'), validate('json', notificationPrefsUpdateSchema), async c =>
    c.json(await updatePrefs(c.get('db'), c.req.valid('json')))
  );
