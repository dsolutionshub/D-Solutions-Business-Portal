import {
  autoRenewSchema,
  can,
  projectCostAddSchema,
  renewCreateSchema,
  type ProjectRenewals
} from '@dsol/shared';
import { Hono } from 'hono';
import { addCost, projectRenewals, renew, setDomainAutoRenew } from '../db/repos/renewals';
import type { AppEnv, AuthUser } from '../env';
import { requirePermission } from '../middleware/requireRole';
import { validate } from '../middleware/validate';

/** Without “projects.sheet”: amounts and due dates, not domain names or providers. */
function forRole(r: ProjectRenewals, who: AuthUser): ProjectRenewals {
  if (can(who, 'projects.sheet')) return r;
  return {
    items: r.items.map(i => ({ ...i, name: `${i.kind} · ${i.projectName}`, provider: null })),
    history: r.history.map(h => ({ ...h, itemName: h.kind ?? 'Renewal', reference: null }))
  };
}

/** /api/renewals/:projectId/:ref/renew — ref: domain | ssl | hosting | cost:<costId> */
export const renewals = new Hono<AppEnv>().post(
  '/:projectId/:ref/renew',
  requirePermission('renewals.write'),
  validate('json', renewCreateSchema),
  async c => {
    const user = c.get('user')!;
    const res = await renew(
      c.get('db'),
      c.req.param('projectId'),
      c.req.param('ref'),
      c.req.valid('json'),
      user
    );
    return c.json(
      can(user, 'projects.sheet')
        ? res
        : {
            ...res,
            item: { ...res.item, name: `${res.item.kind} · ${res.item.projectName}`, provider: null }
          }
    );
  }
);

/** Mounted under /api/projects: a project's renewals, recurring costs and domain auto-renew. */
export const projectRenewalRoutes = new Hono<AppEnv>()
  .get('/:id/renewals', requirePermission('projects.read'), async c =>
    c.json(forRole(await projectRenewals(c.get('db'), c.req.param('id')), c.get('user')!))
  )
  .post('/:id/costs', requirePermission('projects.write'), validate('json', projectCostAddSchema), async c =>
    c.json(await addCost(c.get('db'), c.req.param('id'), c.req.valid('json')), 201)
  )
  .patch(
    '/:id/auto-renew',
    requirePermission('projects.write'),
    validate('json', autoRenewSchema),
    async c => {
      await setDomainAutoRenew(c.get('db'), c.req.param('id'), c.req.valid('json').on);
      return c.json({ on: c.req.valid('json').on });
    }
  );
