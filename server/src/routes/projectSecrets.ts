import { decryptionKeys } from '../services/crypto';
import { secretRevealRequestSchema, type SecretReveal } from '@dsol/shared';
import { Hono } from 'hono';
import { revealSecret } from '../db/repos/projects';
import type { AppEnv } from '../env';
import { requirePermission } from '../middleware/requireRole';
import { validate } from '../middleware/validate';

/**
 * POST /api/projects/:id/secrets/reveal { field } → { value }
 * Roles with “Reveal passwords and secret keys” only, 30 reveals per minute per user, every reveal written to audit_log.
 * Writing secrets happens through the project save (PATCH /api/projects/:id).
 */
const router = new Hono<AppEnv>().post(
  '/:id/secrets/reveal',
  requirePermission('secrets.reveal'),
  validate('json', secretRevealRequestSchema),
  async c => {
    const value = await revealSecret(
      c.get('db'),
      decryptionKeys(c.env),
      c.req.param('id'),
      c.req.valid('json').field,
      c.get('user')!.id
    );
    return c.json<SecretReveal>({ value });
  }
);

export default router;
