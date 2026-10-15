import { printablePage, renderInvoicePaper, renderReceiptPaper } from '@dsol/shared';
import { Hono } from 'hono';
import { getDb } from '../db/client';
import { getInvoice, getPayment } from '../db/repos/invoicing';
import type { AppEnv } from '../env';
import { HttpError } from '../middleware/errors';
import { verifyLink } from '../services/links';

const invalid = () =>
  new HttpError(
    403,
    'link_invalid',
    'This link has expired or is not valid. Ask us for a new copy of the document.'
  );

/**
 * Pages clients open from emails: an invoice or a receipt, only with a valid signed link
 * (services/links.ts). Served without sign-in — Cloudflare Access must bypass /api/public/*.
 */
const router = new Hono<AppEnv>()
  .use(async (c, next) => {
    c.set('db', getDb(c.env));
    await next();
    c.header('X-Robots-Tag', 'noindex');
    c.header('Referrer-Policy', 'no-referrer');
  })
  .get('/invoices/:no', async c => {
    const no = c.req.param('no');
    if (!(await verifyLink(c.env, 'invoice', no, c.req.query('exp'), c.req.query('sig')))) throw invalid();
    const v = await getInvoice(c.get('db'), no);
    if (v.storedStatus === 'Draft') throw invalid();
    return c.html(printablePage(`${v.number} · ${v.clientName}`, renderInvoicePaper(v.paper)));
  })
  .get('/receipts/:id', async c => {
    const id = c.req.param('id');
    if (!(await verifyLink(c.env, 'receipt', id, c.req.query('exp'), c.req.query('sig')))) throw invalid();
    const { payment, seller, balancePaise } = await getPayment(c.get('db'), id);
    return c.html(
      printablePage(
        `${payment.receiptNo} · ${payment.clientName}`,
        renderReceiptPaper(payment, seller, balancePaise)
      )
    );
  });

export default router;
