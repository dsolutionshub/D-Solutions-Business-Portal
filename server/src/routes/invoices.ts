import {
  invoiceCreateSchema,
  invoiceListQuerySchema,
  invoiceUpdateSchema,
  newFromWorkQuerySchema,
  printablePage,
  renderInvoicePaper
} from '@dsol/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  createInvoice,
  draftDefaults,
  draftFromWork,
  duplicateInvoice,
  getInvoice,
  issueInvoice,
  listInvoices,
  updateInvoice,
  voidInvoice
} from '../db/repos/invoicing';
import type { AppEnv } from '../env';
import { requirePermission } from '../middleware/requireRole';
import { validate } from '../middleware/validate';

/** Invoices are addressed by number: /api/invoices/INV-2026-0148 */
const router = new Hono<AppEnv>()
  .use(requirePermission('invoices.read'))

  .get('/', validate('query', invoiceListQuerySchema), async c =>
    c.json(await listInvoices(c.get('db'), c.req.valid('query')))
  )

  /** Editor defaults for a new invoice (optionally for a client). */
  .get('/new', validate('query', z.object({ client: z.string().max(64).optional() })), async c =>
    c.json(await draftDefaults(c.get('db'), c.req.valid('query').client ?? null))
  )

  /** A prefilled draft (not saved) for chosen "To bill" work of one client. */
  .get('/new-from-work', validate('query', newFromWorkQuerySchema), async c =>
    c.json(await draftFromWork(c.get('db'), c.req.valid('query').ids))
  )

  .post('/', requirePermission('invoices.write'), validate('json', invoiceCreateSchema), async c => {
    const no = await createInvoice(c.get('db'), c.req.valid('json'), c.get('user')!.id);
    return c.json(await getInvoice(c.get('db'), no), 201);
  })

  .get('/:no', async c => c.json(await getInvoice(c.get('db'), c.req.param('no'))))

  /** Drafts only; the whole editor (lines replace the old ones). */
  .patch('/:no', requirePermission('invoices.write'), validate('json', invoiceUpdateSchema), async c => {
    await updateInvoice(c.get('db'), c.req.param('no'), c.req.valid('json'));
    return c.json(await getInvoice(c.get('db'), c.req.param('no')));
  })

  .post('/:no/issue', requirePermission('invoices.write'), async c => {
    await issueInvoice(c.get('db'), c.req.param('no'), c.get('user')!.id);
    return c.json(await getInvoice(c.get('db'), c.req.param('no')));
  })

  /** Only without payments; its work goes back to "To bill". */
  .post('/:no/void', requirePermission('invoices.void'), async c => {
    await voidInvoice(c.get('db'), c.req.param('no'), c.get('user')!.id);
    return c.json(await getInvoice(c.get('db'), c.req.param('no')));
  })

  /** A new draft with the same lines but no work links. */
  .post('/:no/duplicate', requirePermission('invoices.write'), async c => {
    const no = await duplicateInvoice(c.get('db'), c.req.param('no'), c.get('user')!.id);
    return c.json(await getInvoice(c.get('db'), no), 201);
  })

  /** Printable A4 page (the same paper as the app) — "Save as PDF" from the print dialog. */
  .get('/:no/pdf', async c => {
    const v = await getInvoice(c.get('db'), c.req.param('no'));
    return c.html(printablePage(`${v.number} · ${v.clientName}`, renderInvoicePaper(v.paper)));
  });

export default router;
