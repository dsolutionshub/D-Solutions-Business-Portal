import { can, projectListQuerySchema, projectSaveSchema } from '@dsol/shared';
import { Hono } from 'hono';
import {
  createProject,
  getProjectView,
  listProjects,
  redactForCosts,
  sheetText,
  updateProject
} from '../db/repos/projects';
import type { AppEnv } from '../env';
import { requirePermission } from '../middleware/requireRole';
import { validate } from '../middleware/validate';

const router = new Hono<AppEnv>()
  .use(requirePermission('projects.read'))

  .get('/', validate('query', projectListQuerySchema), async c =>
    c.json(await listProjects(c.get('db'), c.req.valid('query'), c.get('user')!))
  )

  /** Creates project + sheet + secrets + other keys + costs in one D1 batch. */
  .post('/', requirePermission('projects.write'), validate('json', projectSaveSchema), async c => {
    const id = await createProject(c.get('db'), c.env.ENCRYPTION_KEY, c.req.valid('json'), c.get('user')!.id);
    return c.json(await getProjectView(c.get('db'), id), 201);
  })

  /** Full sheet with “projects.sheet”; otherwise cost amounts and due dates only (redacted here, on the server). */
  .get('/:id', async c => {
    const view = await getProjectView(c.get('db'), c.req.param('id'));
    return c.json(can(c.get('user'), 'projects.sheet') ? view : redactForCosts(view));
  })

  /** Same body as create. Secrets: omitted = unchanged, "" = clear, value = re-encrypt. */
  .patch('/:id', requirePermission('projects.write'), validate('json', projectSaveSchema), async c => {
    await updateProject(
      c.get('db'),
      c.env.ENCRYPTION_KEY,
      c.req.param('id'),
      c.req.valid('json'),
      c.get('user')!.id
    );
    return c.json(await getProjectView(c.get('db'), c.req.param('id')));
  })

  /** Text export of the sheet; secrets are shown as [hidden]. */
  .get('/:id/sheet.txt', requirePermission('projects.sheet'), async c => {
    const view = await getProjectView(c.get('db'), c.req.param('id'));
    const slug = view.project.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    c.header('Content-Type', 'text/plain; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="${slug || 'project'}-sheet.txt"`);
    return c.body(sheetText(view));
  });

export default router;
