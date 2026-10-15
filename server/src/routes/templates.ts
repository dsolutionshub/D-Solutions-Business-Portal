import { emailTemplateCreateSchema, emailTemplateUpdateSchema } from '@dsol/shared';
import { Hono } from 'hono';
import { createTemplate, listTemplates, updateTemplate } from '../db/repos/emails';
import type { AppEnv } from '../env';
import { requirePermission } from '../middleware/requireRole';
import { validate } from '../middleware/validate';

/** Email templates with {{variables}}. Everyone can use them; roles with “Edit email templates” edit. */
const router = new Hono<AppEnv>()
  .use(requirePermission('emails.read'))
  .get('/', async c => c.json({ items: await listTemplates(c.get('db')) }))
  .post('/', requirePermission('templates.write'), validate('json', emailTemplateCreateSchema), async c =>
    c.json(await createTemplate(c.get('db'), c.req.valid('json')), 201)
  )
  .patch('/:id', requirePermission('templates.write'), validate('json', emailTemplateUpdateSchema), async c =>
    c.json(await updateTemplate(c.get('db'), c.req.param('id'), c.req.valid('json')))
  );

export default router;
