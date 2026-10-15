import { workItemCreateSchema, workItemUpdateSchema, workListQuerySchema } from '@dsol/shared';
import { Hono } from 'hono';
import { createWork, deleteWork, getWork, listWork, toggleBillable, updateWork } from '../db/repos/work';
import type { AppEnv } from '../env';
import { requirePermission } from '../middleware/requireRole';
import { validate } from '../middleware/validate';

const router = new Hono<AppEnv>()
  .use(requirePermission('work.read'))

  .get('/', validate('query', workListQuerySchema), async c =>
    c.json(await listWork(c.get('db'), c.req.valid('query')))
  )

  .post('/', requirePermission('work.write'), validate('json', workItemCreateSchema), async c => {
    const id = await createWork(c.get('db'), c.req.valid('json'));
    return c.json(await getWork(c.get('db'), id), 201);
  })

  .get('/:id', async c => c.json(await getWork(c.get('db'), c.req.param('id'))))

  .patch('/:id', requirePermission('work.write'), validate('json', workItemUpdateSchema), async c => {
    await updateWork(c.get('db'), c.req.param('id'), c.req.valid('json'));
    return c.json(await getWork(c.get('db'), c.req.param('id')));
  })

  /** Only while it isn't on a non-void invoice. */
  .delete('/:id', requirePermission('work.write'), async c => {
    await deleteWork(c.get('db'), c.req.param('id'));
    return c.body(null, 204);
  })

  .post('/:id/toggle-billable', requirePermission('work.write'), async c => {
    await toggleBillable(c.get('db'), c.req.param('id'));
    return c.json(await getWork(c.get('db'), c.req.param('id')));
  });

export default router;
