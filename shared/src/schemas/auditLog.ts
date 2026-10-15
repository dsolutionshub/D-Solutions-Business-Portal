/** Append-only record of sensitive actions (secret reveals, voids, role changes…). Never holds secret values. */
import { z } from 'zod';
import { AUDIT_ACTIONS } from '../constants';
import { id, isoDateTime } from './common';

export const auditLogSchema = z.object({
  id,
  userId: id.nullable(),
  action: z.enum(AUDIT_ACTIONS),
  entity: z.string().min(1).max(40),
  entityId: z.string().min(1).max(64),
  meta: z.record(z.string(), z.unknown()).nullable(),
  createdAt: isoDateTime
});

export const auditLogCreateSchema = auditLogSchema.omit({ id: true, createdAt: true });
/** Audit entries are never edited; this exists only to keep the per-entity API uniform. */
export const auditLogUpdateSchema = z.object({}).strict();

export type AuditLog = z.infer<typeof auditLogSchema>;
export type AuditLogCreate = z.infer<typeof auditLogCreateSchema>;
export type AuditLogUpdate = z.infer<typeof auditLogUpdateSchema>;
