import { can, emailListQuerySchema, emailPrefillQuerySchema, emailSendSchema } from '@dsol/shared';
import { Hono } from 'hono';
import {
  cancelScheduled,
  emailQuota,
  getEmail,
  listEmails,
  prefill,
  resendEmail,
  sendEmail
} from '../db/repos/emails';
import type { AppEnv } from '../env';
import { forbidden } from '../middleware/errors';
import { requirePermission } from '../middleware/requireRole';
import { validate } from '../middleware/validate';

/** Email Center: history, sending (now or scheduled), retry / cancel, and prefilled emails for actions. */
const router = new Hono<AppEnv>()
  .use(requirePermission('emails.read'))
  .get('/', validate('query', emailListQuerySchema), async c =>
    c.json(await listEmails(c.get('db'), c.req.valid('query')))
  )
  .get('/quota', async c => c.json(await emailQuota(c.get('db'), c.env)))
  .get('/prefill', validate('query', emailPrefillQuerySchema), async c => {
    const q = c.req.valid('query');
    // invoice, reminder and receipt emails carry billing data
    if (q.for !== 'release' && !can(c.get('user'), 'invoices.read')) throw forbidden();
    return c.json(await prefill(c.get('db'), q));
  })
  .get('/:id', async c => c.json(await getEmail(c.get('db'), c.req.param('id'))))
  .post('/send', requirePermission('emails.send'), validate('json', emailSendSchema), async c => {
    const body = c.req.valid('json');
    const user = c.get('user')!;
    if (body.attachments.length && !can(user, 'invoices.read')) throw forbidden();
    const res = await sendEmail(
      c.get('db'),
      c.env,
      {
        clientId: body.clientId,
        to: body.to,
        cc: body.cc,
        subject: body.subject,
        html: body.html,
        template: body.template ?? null,
        scheduledAt: body.scheduledAt ?? null,
        attachments: body.attachments,
        releaseId: body.releaseId ?? null
      },
      user
    );
    return c.json(res!, 201);
  })
  .post('/:id/resend', requirePermission('emails.send'), async c =>
    c.json(await resendEmail(c.get('db'), c.env, c.req.param('id'), c.get('user')!))
  )
  .post('/:id/cancel', requirePermission('emails.send'), async c => {
    await cancelScheduled(c.get('db'), c.req.param('id'));
    return c.json(await getEmail(c.get('db'), c.req.param('id')));
  });

export default router;
