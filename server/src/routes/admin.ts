import { todayIso, type SystemInfo } from '@dsol/shared';
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { dailyJobHealth, recentCronRuns, runDaily } from '../cron/daily';
import { exportAll } from '../db/repos/admin';
import { insertAudit } from '../db/repos/util';
import type { AppEnv } from '../env';
import { iterationsFrom } from '../services/password';
import { requirePermission } from '../middleware/requireRole';

/** Settings → Data: export everything, run the daily reminders now, recent runs. System guide. */
const router = new Hono<AppEnv>()
  /**
   * System guide (Admins only): how this installation is set up. Secrets are reported only as
   * set / not set — their values never leave Cloudflare.
   */
  .get('/system', requirePermission('team.manage'), async c => {
    const db = c.get('db');
    const [counts] = await db.all<{ tables: number; users: number }>(
      sql`SELECT (SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%') AS tables,
                 (SELECT count(*) FROM users WHERE status != 'Deactivated') AS users`
    );
    const e = c.env;
    return c.json<SystemInfo>({
      environment: e.ENVIRONMENT,
      version: e.APP_VERSION ?? 'dev',
      appUrl: e.APP_URL ?? null,
      apiUrl: new URL(c.req.url).origin,
      emailFrom: `${e.EMAIL_FROM_NAME} <${e.EMAIL_FROM_ADDRESS}>`,
      secrets: {
        encryptionKey: !!e.ENCRYPTION_KEY,
        previousEncryptionKey: !!e.ENCRYPTION_KEY_PREVIOUS,
        brevoApiKey: !!e.BREVO_API_KEY
      },
      passwordHashRounds: iterationsFrom(e),
      accessEnabled: !!(e.ACCESS_TEAM_DOMAIN && e.ACCESS_AUD),
      database: { tables: counts?.tables ?? 0, activeUsers: counts?.users ?? 0 },
      dailyJob: await dailyJobHealth(db)
    });
  })
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
