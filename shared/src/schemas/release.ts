import { z } from 'zod';
import { RELEASE_ITEM_KINDS, RELEASE_MAIL_STATUSES, RELEASE_STATUSES } from '../constants';
import { id, isoDate, requiredText, timestamps, version } from './common';

/** One line of a release: a feature, a bug fix or a known issue. */
export const releaseItemSchema = z.object({
  id,
  releaseId: id,
  kind: z.enum(RELEASE_ITEM_KINDS),
  text: requiredText('Describe the item.', 300),
  sortOrder: z.number().int().min(0)
});

const lines = z.array(z.string().trim().min(1).max(300)).max(100);

export const releaseSchema = z.object({
  id,
  projectId: id,
  version,
  /** Environment code from Settings → Dropdown lists → Environments. */
  environment: z.string().trim().min(1).max(12),
  releaseDate: isoDate,
  status: z.enum(RELEASE_STATUSES),
  releasedBy: id.nullable(),
  mailStatus: z.enum(RELEASE_MAIL_STATUSES),
  features: lines,
  fixes: lines,
  issues: lines,
  ...timestamps
});

/** Releases are logged once deployed to production: PROD and Deployed unless given. */
export const releaseCreateSchema = releaseSchema
  .omit({ id: true, mailStatus: true, createdAt: true, updatedAt: true })
  .extend({
    environment: releaseSchema.shape.environment.default('PROD'),
    status: releaseSchema.shape.status.default('Deployed')
  })
  .refine(r => r.features.length + r.fixes.length > 0, {
    path: ['features'],
    message: 'Add at least one feature or bug fix.'
  });

export const releaseUpdateSchema = releaseSchema
  .omit({ id: true, projectId: true, createdAt: true, updatedAt: true })
  .partial();

export type Release = z.infer<typeof releaseSchema>;
export type ReleaseItem = z.infer<typeof releaseItemSchema>;
export type ReleaseCreate = z.infer<typeof releaseCreateSchema>;
export type ReleaseUpdate = z.infer<typeof releaseUpdateSchema>;
