import { Hono } from 'hono';
import { dailyJobHealth } from '../cron/daily';
import { getDb } from '../db/client';
import type { AppEnv } from '../env';

/**
 * GET /api/health — for uptime checks. No sign-in (Access must bypass this one path) and no data:
 * only whether the database answers and whether the daily job ran in the last 26 hours.
 * 200 when healthy, 503 otherwise.
 */
const router = new Hono<AppEnv>().get('/', async c => {
  let database: 'ok' | 'error' = 'ok';
  let dailyJob: Awaited<ReturnType<typeof dailyJobHealth>> = 'never';
  try {
    const db = getDb(c.env);
    dailyJob = await dailyJobHealth(db);
  } catch {
    database = 'error';
  }
  const ok = database === 'ok' && (dailyJob === 'ok' || dailyJob === 'never');
  return c.json({ ok, version: c.env.APP_VERSION ?? 'dev', checks: { database, dailyJob } }, ok ? 200 : 503);
});

export default router;
