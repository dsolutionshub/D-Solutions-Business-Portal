import { LIST_KEYS, listAddSchema, listReorderSchema, type ListKey, type ListsResponse } from '@dsol/shared';
import { asc } from 'drizzle-orm';
import { Hono } from 'hono';
import { addListValue, isListKey, listUsage, removeListValue, reorderList } from '../db/repos/admin';
import { lists } from '../db/schema';
import type { AppEnv } from '../env';
import { notFound } from '../middleware/errors';
import { requirePermission } from '../middleware/requireRole';
import { validate } from '../middleware/validate';

const keyOf = (k: string): ListKey => {
  if (!isListKey(k)) throw notFound('List');
  return k;
};

/**
 * Dropdown lists. GET /api/lists → { environments: [...], hosting: [...], … } in display order.
 * Roles with “Edit dropdown lists” add, remove and reorder. Records store the text, so removing never changes them.
 */
const router = new Hono<AppEnv>()
  .get('/', async c => {
    const rows = await c.get('db').select().from(lists).orderBy(asc(lists.listKey), asc(lists.sortOrder));
    const out = Object.fromEntries(LIST_KEYS.map(k => [k, [] as string[]])) as ListsResponse;
    for (const r of rows) out[r.listKey].push(r.value);
    return c.json(out);
  })
  .get('/:key/:value/usage', async c =>
    c.json(await listUsage(c.get('db'), keyOf(c.req.param('key')), c.req.param('value')))
  )
  .post('/:key/reorder', requirePermission('lists.write'), validate('json', listReorderSchema), async c =>
    c.json({ values: await reorderList(c.get('db'), keyOf(c.req.param('key')), c.req.valid('json').values) })
  )
  .post('/:key', requirePermission('lists.write'), validate('json', listAddSchema), async c => {
    const values = await addListValue(
      c.get('db'),
      keyOf(c.req.param('key')),
      c.req.valid('json').value,
      c.get('user')!.id
    );
    return c.json({ values }, 201);
  })
  .delete('/:key/:value', requirePermission('lists.write'), async c =>
    c.json({
      values: await removeListValue(
        c.get('db'),
        keyOf(c.req.param('key')),
        c.req.param('value'),
        c.get('user')!.id
      )
    })
  );

export default router;
