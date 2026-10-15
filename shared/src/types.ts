import type { Role } from './constants';
import type { Permission } from './permissions';

/** The signed-in staff member, as returned by GET /api/me. */
export interface Me {
  email: string;
  /** null when the email is not an active user of the portal (show "no access"). */
  user: {
    id: string;
    name: string;
    email: string;
    role: Role;
    /** what this person's role allows (the server checks the same list) */
    permissions: Permission[];
  } | null;
  /** How this request was signed in: portal password session, Cloudflare Access, or local development. */
  via: 'password' | 'access' | 'dev';
}

/**
 * Shape of every API error body.
 * `fields` maps a field path (e.g. "name", "sheet.links.prod") to its message, for forms.
 */
export interface ApiErrorBody {
  error: { code: string; message: string; fields?: Record<string, string> };
}
