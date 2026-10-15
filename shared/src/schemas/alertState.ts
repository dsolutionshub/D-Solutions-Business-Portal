/**
 * Alerts are computed live (renewals + invoices + preferences) and never stored.
 * alert_state only remembers, per user, which alerts were read or dismissed.
 * An alert id includes its due date, so a renewed item raises a fresh alert next time.
 */
import { z } from 'zod';
import { ALERT_TYPES } from '../constants';
import { id, isoDate, isoDateTime } from './common';

export const alertStateSchema = z.object({
  userId: id,
  alertId: z.string().min(1).max(200),
  readAt: isoDateTime.nullable(),
  dismissedAt: isoDateTime.nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime
});

/** Mark read/unread, dismiss/restore. */
export const alertStateCreateSchema = z.object({
  alertId: alertStateSchema.shape.alertId,
  read: z.boolean().optional(),
  dismissed: z.boolean().optional()
});
export const alertStateUpdateSchema = alertStateCreateSchema.omit({ alertId: true }).partial();

/** A computed alert, as shown in the bell menu and Notifications. */
export const alertSchema = z.object({
  id: z.string(),
  type: z.enum(ALERT_TYPES),
  title: z.string(),
  body: z.string(),
  dueDate: isoDate,
  daysLeft: z.number().int(),
  tone: z.enum(['bad', 'warn', 'info']),
  /** In-app link, e.g. /projects/pj_p1 */
  href: z.string(),
  read: z.boolean(),
  dismissed: z.boolean()
});

/** GET /api/alerts */
export const alertListQuerySchema = z.object({
  type: z.enum(ALERT_TYPES).optional(),
  state: z.enum(['all', 'unread', 'read']).default('all'),
  /** "1" = also list dismissed alerts */
  dismissed: z.enum(['0', '1']).default('0'),
  limit: z.coerce.number().int().min(1).max(500).optional()
});

export interface AlertListResponse {
  items: Alert[];
  /** across all types and states (not dismissed) */
  unread: number;
  total: number;
  dismissedCount: number;
  byType: Partial<Record<(typeof ALERT_TYPES)[number], number>>;
}

export type AlertState = z.infer<typeof alertStateSchema>;
export type AlertStateCreate = z.infer<typeof alertStateCreateSchema>;
export type AlertStateUpdate = z.infer<typeof alertStateUpdateSchema>;
export type Alert = z.infer<typeof alertSchema>;
export type AlertListQuery = z.input<typeof alertListQuerySchema>;
export type AlertListParams = Partial<z.output<typeof alertListQuerySchema>>;
