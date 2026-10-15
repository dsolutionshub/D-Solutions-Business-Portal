import { can, type Permission } from '@dsol/shared';
import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../env';
import { forbidden } from './errors';

/** Allow the request only if the user's role has this permission (see shared/permissions.ts). */
export const requirePermission = (permission: Permission) =>
  createMiddleware<AppEnv>(async (c, next) => {
    if (!can(c.get('user'), permission)) throw forbidden();
    await next();
  });
