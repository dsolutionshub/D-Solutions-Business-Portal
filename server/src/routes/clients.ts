import {
  clientCreateSchema,
  clientListQuerySchema,
  clientUpdateSchema,
  contactCreateSchema,
  todayIso
} from '@dsol/shared';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import {
  archiveClient,
  deleteClient,
  createClient,
  getClientRow,
  getClientView,
  listClients,
  restoreClient,
  setClientLogo,
  updateClient
} from '../db/repos/clients';
import { projectsForExport } from '../db/repos/projects';
import { csvCell, insertAudit } from '../db/repos/util';
import { newId } from '../db/ids';
import { clientLogos, contacts, invoices } from '../db/schema';
import type { AppEnv } from '../env';
import { badRequest, HttpError } from '../middleware/errors';
import { requirePermission } from '../middleware/requireRole';
import { validate } from '../middleware/validate';

const LOGO_MAX_BYTES = 1024 * 1024;
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

/** Bytes ↔ base64 (logos are stored as text in D1). */
function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));

const router = new Hono<AppEnv>()
  .use(requirePermission('clients.read'))

  .get('/', validate('query', clientListQuerySchema), async c =>
    c.json(await listClients(c.get('db'), c.req.valid('query')))
  )

  /** All non-archived clients as CSV (the list is paginated; the export is not). */
  .get('/export.csv', async c => {
    const db = c.get('db');
    const { items } = await listClients(db, { status: 'all', page: 1, pageSize: 10_000, q: undefined });
    const rows = [
      [
        'Client',
        'Website',
        'Industry',
        'Primary contact',
        'Email',
        'Phone',
        'Active projects',
        'Next domain expiry',
        'Status'
      ],
      ...items.map(r => [
        r.name,
        r.website,
        r.industry,
        r.contactName,
        r.contactEmail,
        r.contactPhone,
        r.activeProjects,
        r.nextDomainExpiry,
        r.status
      ])
    ];
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="clients-${todayIso()}.csv"`);
    return c.body(rows.map(r => r.map(csvCell).join(',')).join('\n') + '\n');
  })

  .post('/', requirePermission('clients.write'), validate('json', clientCreateSchema), async c => {
    const id = await createClient(c.get('db'), c.req.valid('json'));
    return c.json(await getClientView(c.get('db'), id), 201);
  })

  .get('/:id', async c => c.json(await getClientView(c.get('db'), c.req.param('id'))))

  .patch('/:id', requirePermission('clients.write'), validate('json', clientUpdateSchema), async c => {
    await updateClient(c.get('db'), c.req.param('id'), c.req.valid('json'));
    return c.json(await getClientView(c.get('db'), c.req.param('id')));
  })

  .post('/:id/archive', requirePermission('clients.archive'), async c => {
    await archiveClient(c.get('db'), c.req.param('id'), c.get('user')!.id);
    return c.json(await getClientView(c.get('db'), c.req.param('id')));
  })

  .post('/:id/restore', requirePermission('clients.archive'), async c => {
    await restoreClient(c.get('db'), c.req.param('id'), c.get('user')!.id);
    return c.json(await getClientView(c.get('db'), c.req.param('id')));
  })
  /** Permanently delete an archived client that has no invoices. */
  .delete('/:id', requirePermission('clients.archive'), async c => {
    // the logo goes with the client (ON DELETE CASCADE)
    await deleteClient(c.get('db'), c.req.param('id'), c.get('user')!.id);
    return c.body(null, 204);
  })

  /** Everything about a client as JSON. Secrets are never included. */
  .get('/:id/export', requirePermission('clients.export'), async c => {
    const db = c.get('db');
    const id = c.req.param('id');
    const client = await getClientView(db, id);
    const [contactRows, projects, invoiceRows] = await Promise.all([
      db.select().from(contacts).where(eq(contacts.clientId, id)),
      projectsForExport(db, id),
      db.select().from(invoices).where(eq(invoices.clientId, id))
    ]);
    await insertAudit(db, {
      userId: c.get('user')!.id,
      action: 'data.export',
      entity: 'client',
      entityId: id
    });
    const slug = client.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    c.header('Content-Disposition', `attachment; filename="${slug || 'client'}-export-${todayIso()}.json"`);
    return c.json({
      exportedAt: new Date().toISOString(),
      note: 'Secret values are never exported.',
      client,
      contacts: contactRows,
      projects,
      invoices: invoiceRows
    });
  })

  /* ------------------------------------------------------------- contacts */

  .get('/:id/contacts', async c => {
    await getClientRow(c.get('db'), c.req.param('id'));
    const rows = await c
      .get('db')
      .select()
      .from(contacts)
      .where(eq(contacts.clientId, c.req.param('id')))
      .orderBy(contacts.createdAt);
    // Primary contact first
    return c.json({ items: rows.sort((a, b) => Number(b.tag === 'Primary') - Number(a.tag === 'Primary')) });
  })

  .post(
    '/:id/contacts',
    requirePermission('clients.write'),
    validate('json', contactCreateSchema.omit({ clientId: true })),
    async c => {
      const db = c.get('db');
      const clientId = c.req.param('id');
      const client = await getClientRow(db, clientId);
      if (client.archivedAt)
        throw new HttpError(409, 'archived', 'Restore this client before adding contacts.');
      const input = c.req.valid('json');
      if (input.tag === 'Primary')
        throw badRequest('The primary contact is edited on the client form.', {
          tag: 'Choose Technical, Billing or Marketing.'
        });
      const [row] = await db
        .insert(contacts)
        .values({ id: newId('contact'), clientId, ...input })
        .returning();
      return c.json(row, 201);
    }
  )

  /* ----------------------------------------------------------------- logo */

  .get('/:id/logo', async c => {
    const db = c.get('db');
    const client = await getClientRow(db, c.req.param('id'));
    const [logo] = client.logoKey
      ? await db.select().from(clientLogos).where(eq(clientLogos.clientId, client.id))
      : [];
    if (!logo) throw new HttpError(404, 'not_found', 'No logo.');
    c.header('Content-Type', logo.contentType);
    // The URL carries a version, so it can be cached; the CSP stops scripts inside SVGs.
    c.header('Cache-Control', 'private, max-age=86400');
    c.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    c.header('X-Content-Type-Options', 'nosniff');
    return c.body(fromBase64(logo.data));
  })

  .post('/:id/logo', requirePermission('clients.write'), async c => {
    const db = c.get('db');
    const client = await getClientRow(db, c.req.param('id'));
    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File))
      throw badRequest('Choose an image to upload.', { logo: 'Choose an image to upload.' });
    if (!LOGO_TYPES.includes(file.type))
      throw new HttpError(415, 'unsupported_type', 'Logos must be PNG, JPG, WebP or SVG.', {
        logo: 'Use PNG, JPG, WebP or SVG.'
      });
    if (file.size > LOGO_MAX_BYTES)
      throw new HttpError(413, 'too_large', 'Logo must be smaller than 1 MB.', {
        logo: 'Logo must be smaller than 1 MB.'
      });
    const row = { contentType: file.type, data: toBase64(new Uint8Array(await file.arrayBuffer())) };
    await db
      .insert(clientLogos)
      .values({ clientId: client.id, ...row })
      .onConflictDoUpdate({ target: clientLogos.clientId, set: row });
    // a new version in the URL, so browsers fetch the new image
    await setClientLogo(db, client.id, `v-${nanoid(10)}`);
    return c.json(await getClientView(db, client.id));
  })

  .delete('/:id/logo', requirePermission('clients.write'), async c => {
    const db = c.get('db');
    const client = await getClientRow(db, c.req.param('id'));
    if (client.logoKey) {
      await setClientLogo(db, client.id, null);
      await db.delete(clientLogos).where(eq(clientLogos.clientId, client.id));
    }
    return c.json(await getClientView(db, client.id));
  });

export default router;
