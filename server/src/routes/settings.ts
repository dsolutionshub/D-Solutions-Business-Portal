import { settingsUpdateSchema } from '@dsol/shared';
import { Hono } from 'hono';
import { settingsView, updateSettings } from '../db/repos/admin';
import type { AppEnv } from '../env';
import { requirePermission } from '../middleware/requireRole';
import { validate } from '../middleware/validate';

/** Company profile, invoicing defaults, email sender and limits. Everyone reads; roles with “Change settings” edit. */
const router = new Hono<AppEnv>()
  .get('/', async c => c.json(await settingsView(c.get('db'), c.env)))
  .patch('/', requirePermission('settings.write'), validate('json', settingsUpdateSchema), async c => {
    await updateSettings(c.get('db'), c.req.valid('json'), c.get('user')!.id);
    return c.json(await settingsView(c.get('db'), c.env));
  });

export default router;
