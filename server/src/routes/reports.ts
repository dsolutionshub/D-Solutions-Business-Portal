import { REPORT_KEYS, reportQuerySchema, todayIso, type ReportKey } from '@dsol/shared';
import { Hono } from 'hono';
import { buildReports, reportCsv } from '../db/repos/reports';
import { toCsv } from '../db/repos/util';
import type { AppEnv } from '../env';
import { notFound } from '../middleware/errors';
import { requirePermission } from '../middleware/requireRole';
import { validate } from '../middleware/validate';

/** Revenue, receivables, costs and renewals — GET /api/reports?range=6M|12M|YTD&client= and one CSV per report. */
const router = new Hono<AppEnv>()
  .use(requirePermission('reports.read'))
  .get('/', validate('query', reportQuerySchema), async c => {
    const q = c.req.valid('query');
    return c.json(await buildReports(c.get('db'), q.range, q.client));
  })
  .get('/:file', validate('query', reportQuerySchema), async c => {
    const key = c.req.param('file').replace(/\.csv$/, '') as ReportKey;
    if (!c.req.param('file').endsWith('.csv') || !REPORT_KEYS.includes(key)) throw notFound('Report');
    const q = c.req.valid('query');
    const r = await buildReports(c.get('db'), q.range, q.client);
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="report-${key}-${todayIso()}.csv"`);
    return c.body(toCsv(reportCsv(r, key)));
  });

export default router;
