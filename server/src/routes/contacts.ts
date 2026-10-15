import { contactUpdateSchema } from '@dsol/shared';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { getClientRow } from '../db/repos/clients';
import { contacts } from '../db/schema';
import type { AppEnv } from '../env';
import { badRequest, HttpError, notFound } from '../middleware/errors';
import { requirePermission } from '../middleware/requireRole';
import { validate } from '../middleware/validate';

/** A single contact: edit (incl. the release-email toggle) and remove. Listing/adding is under /clients/:id/contacts. */
const router = new Hono<AppEnv>()
  .use(requirePermission('clients.write'))

  .patch('/:id', validate('json', contactUpdateSchema), async c => {
    const db = c.get('db');
    const [row] = await db
      .select()
      .from(contacts)
      .where(eq(contacts.id, c.req.param('id')))
      .limit(1);
    if (!row) throw notFound('Contact');
    if ((await getClientRow(db, row.clientId)).archivedAt)
      throw new HttpError(409, 'archived', 'Restore this client before editing contacts.');
    const input = c.req.valid('json');
    if (input.tag && (input.tag === 'Primary') !== (row.tag === 'Primary'))
      throw badRequest('The primary contact is changed on the client form.', {
        tag: 'The primary contact is changed on the client form.'
      });
    const [updated] = await db.update(contacts).set(input).where(eq(contacts.id, row.id)).returning();
    return c.json(updated);
  })

  .delete('/:id', async c => {
    const db = c.get('db');
    const [row] = await db
      .select()
      .from(contacts)
      .where(eq(contacts.id, c.req.param('id')))
      .limit(1);
    if (!row) throw notFound('Contact');
    if (row.tag === 'Primary')
      throw new HttpError(
        409,
        'primary_contact',
        'The primary contact can’t be removed. Change the primary contact on the client form first.'
      );
    await db.delete(contacts).where(eq(contacts.id, row.id));
    return c.body(null, 204);
  });

export default router;
