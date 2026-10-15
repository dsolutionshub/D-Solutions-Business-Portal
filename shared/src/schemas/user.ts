import { z } from 'zod';
import { USER_STATUSES, type Role } from '../constants';
import { email, id, isoDateTime, requiredText, timestamps } from './common';

/** "Admin" or a custom role's name (the server checks it exists). */
const roleName = z.string().trim().min(1, 'Pick a role.').max(40);

/** A staff member. Identified by their Cloudflare Access email. */
export const userSchema = z.object({
  id,
  email,
  name: requiredText('Name is required.', 120),
  role: roleName,
  status: z.enum(USER_STATUSES),
  lastLoginAt: isoDateTime.nullable(),
  ...timestamps
});

/** Invite, as Admin or a custom role. */
export const userCreateSchema = z.object({
  email,
  name: userSchema.shape.name,
  role: roleName
});

/**
 * Email is the identity, so it can't change. Role changes are Admin-only; status is Active or
 * Deactivated (no hard delete).
 */
export const userUpdateSchema = z
  .object({
    name: userSchema.shape.name,
    role: roleName,
    status: z.enum(['Active', 'Deactivated'])
  })
  .partial()
  .refine(v => Object.keys(v).length > 0, 'Nothing to change.');

/** Team page row. */
export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: (typeof USER_STATUSES)[number];
  lastLoginAt: string | null;
  createdAt: string;
}

export type User = z.infer<typeof userSchema>;
export type UserCreate = z.infer<typeof userCreateSchema>;
export type UserUpdate = z.infer<typeof userUpdateSchema>;
