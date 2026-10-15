import {
  paymentCreateSchema,
  paymentListQuerySchema,
  printablePage,
  renderReceiptPaper,
  todayIso
} from '@dsol/shared';
import { Hono } from 'hono';
import { getPayment, listPayments, recordPayment } from '../db/repos/invoicing';
import { csvCell } from '../db/repos/util';
import type { AppEnv } from '../env';
import { requirePermission } from '../middleware/requireRole';
import { validate } from '../middleware/validate';

const router = new Hono<AppEnv>()
  .use(requirePermission('payments.read'))

  .get('/', validate('query', paymentListQuerySchema), async c =>
    c.json(await listPayments(c.get('db'), c.req.valid('query')))
  )

  .get('/export.csv', validate('query', paymentListQuerySchema), async c => {
    const { items } = await listPayments(c.get('db'), {
      ...c.req.valid('query'),
      page: 1,
      pageSize: 100_000
    });
    const rows = [
      ['Receipt', 'Date', 'Invoice', 'Client', 'Method', 'Reference', 'Amount (₹)', 'Note'],
      ...items.map(p => [
        p.receiptNo,
        p.paidOn,
        p.invoiceNo,
        p.clientName,
        p.method,
        p.reference,
        (p.amountPaise / 100).toFixed(2),
        p.note
      ])
    ];
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="payments-${todayIso()}.csv"`);
    return c.body(rows.map(r => r.map(csvCell).join(',')).join('\n') + '\n');
  })

  /** More than 0 and at most the balance due; settling an invoice makes its work "Paid". */
  .post('/', requirePermission('payments.record'), validate('json', paymentCreateSchema), async c =>
    c.json(await recordPayment(c.get('db'), c.req.valid('json'), c.get('user')!.id), 201)
  )

  .get('/:id', async c => c.json(await getPayment(c.get('db'), c.req.param('id'))))

  /** Printable receipt (the same paper as the app). */
  .get('/:id/receipt', async c => {
    const { payment, seller, balancePaise } = await getPayment(c.get('db'), c.req.param('id'));
    return c.html(
      printablePage(
        `${payment.receiptNo} · ${payment.clientName}`,
        renderReceiptPaper(payment, seller, balancePaise)
      )
    );
  });

export default router;
