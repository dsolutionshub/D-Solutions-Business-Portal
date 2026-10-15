import {
  releaseBillSchema,
  releaseCreateSchema,
  releaseListQuerySchema,
  releaseUpdateSchema
} from '@dsol/shared';
import { Hono } from 'hono';
import {
  billRelease,
  createRelease,
  deleteRelease,
  getRelease,
  listReleases,
  markDeployed,
  releaseNotesText,
  updateRelease
} from '../db/repos/releases';
import type { AppEnv } from '../env';
import { requirePermission } from '../middleware/requireRole';
import { validate } from '../middleware/validate';

const router = new Hono<AppEnv>()
  .use(requirePermission('releases.read'))

  .get('/', validate('query', releaseListQuerySchema), async c =>
    c.json(await listReleases(c.get('db'), c.req.valid('query')))
  )

  .post('/', requirePermission('releases.write'), validate('json', releaseCreateSchema), async c => {
    const id = await createRelease(c.get('db'), c.req.valid('json'));
    return c.json(await getRelease(c.get('db'), id), 201);
  })

  .get('/:id', async c => c.json(await getRelease(c.get('db'), c.req.param('id'))))

  .patch('/:id', requirePermission('releases.write'), validate('json', releaseUpdateSchema), async c => {
    await updateRelease(c.get('db'), c.req.param('id'), c.req.valid('json'));
    return c.json(await getRelease(c.get('db'), c.req.param('id')));
  })

  /** Refused if any work from it is on a non-void invoice. */
  .delete('/:id', requirePermission('releases.write'), async c => {
    await deleteRelease(c.get('db'), c.req.param('id'));
    return c.body(null, 204);
  })

  .post('/:id/mark-deployed', requirePermission('releases.write'), async c => {
    await markDeployed(c.get('db'), c.req.param('id'));
    return c.json(await getRelease(c.get('db'), c.req.param('id')));
  })

  .get('/:id/notes.txt', async c => {
    const r = await getRelease(c.get('db'), c.req.param('id'));
    c.header('Content-Type', 'text/plain; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="${r.version}-release-notes.txt"`);
    return c.body(releaseNotesText(r));
  })

  /** Features and fixes → Billable work (skips items already billed from this release). Accounts may price work too. */
  .post('/:id/bill', requirePermission('work.write'), validate('json', releaseBillSchema), async c => {
    const result = await billRelease(c.get('db'), c.req.param('id'), c.req.valid('json'));
    return c.json({ ...result, release: await getRelease(c.get('db'), c.req.param('id')) });
  });

export default router;
