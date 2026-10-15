import { todayIso } from '@dsol/shared';
import { Hono } from 'hono';
import { recentCronRuns, runDaily } from '../cron/daily';
import { exportAll } from '../db/repos/admin';
import { insertAudit } from '../db/repos/util';
import type { AppEnv } from '../env';
import { requirePermission } from '../middleware/requireRole';

/** Settings → Data: export everything, run the daily reminders now, recent runs. */
const router = new Hono<AppEnv>()
  .get('/export', requirePermission('data.export'), async c => {
    const data = await exportAll(c.get('db'), c.get('user')!.id);
    c.header('Content-Disposition', `attachment; filename="dsol-portal-export-${todayIso()}.json"`);
    return c.json(data);
  })
  .get('/cron-runs', requirePermission('cron.read'), async c =>
    c.json({ items: await recentCronRuns(c.get('db')) })
  )
  .post('/run-cron', requirePermission('cron.run'), async c => {
    const run = await runDaily(c.env, { trigger: 'manual' });
    await insertAudit(c.get('db'), {
      userId: c.get('user')!.id,
      action: 'cron.run',
      entity: 'cron',
      entityId: run.id
    });
    return c.json(run);
  });

export default router;
