/** Custom roles: a name and the permissions it grants (Admin is built in and fixed). */
import { z } from 'zod';
import { ASSIGNABLE_PERMISSIONS, type Permission } from '../permissions';

export const roleNameSchema = z
  .string()
  .trim()
  .min(2, 'Give the role a name (2–40 characters).')
  .max(40, 'Use at most 40 characters.')
  .refine(n => n.toLowerCase() !== 'admin', 'Admin is the built-in role. Pick another name.');

export const roleInputSchema = z.object({
  name: roleNameSchema,
  permissions: z
    .array(z.enum(ASSIGNABLE_PERMISSIONS as [Permission, ...Permission[]]))
    .min(1, 'Pick at least one permission.')
    .transform(list => [...new Set(list)])
});

export const roleUpdateSchema = roleInputSchema
  .partial()
  .refine(v => Object.keys(v).length > 0, 'Nothing to change.');

/** GET /api/roles: Admin (built in) first, then custom roles by name. */
export interface RoleView {
  /** null for the built-in Admin role */
  id: string | null;
  name: string;
  builtin: boolean;
  permissions: Permission[];
  /** people with this role who are not deactivated */
  members: number;
}

export type RoleInput = z.infer<typeof roleInputSchema>;
export type RoleUpdate = z.infer<typeof roleUpdateSchema>;
