import type { Permission, Role } from '@dsol/shared';
import type { Db } from './db/client';

/** Worker bindings: wrangler.toml [vars] (per environment) + D1/R2 bindings + secrets. */
export interface Env {
  DB: D1Database;
  /** development = `wrangler dev` on your machine; staging / production = deployed behind Cloudflare Access */
  ENVIRONMENT: 'development' | 'staging' | 'production';
  EMAIL_FROM_ADDRESS: string;
  EMAIL_FROM_NAME: string;
  /** Public address of the app (no trailing slash), for links in emails, e.g. https://app.example.com */
  APP_URL?: string;
  /** Cloudflare Access team domain, e.g. "dsolutions.cloudflareaccess.com" */
  ACCESS_TEAM_DOMAIN?: string;
  /** Application Audience (AUD) tag of the Access application that protects the app */
  ACCESS_AUD?: string;
  /**
   * Only for the fallback set-up without a custom domain (app and API on different hosts):
   * comma-separated origins allowed to call the API with credentials. Empty = no CORS at all.
   */
  CORS_ORIGINS?: string;
  /** Build/commit identifier shown by /api/health (set by the deploy workflow). */
  APP_VERSION?: string;
  /** secret — base64 AES-256 key for project secrets */
  ENCRYPTION_KEY: string;
  /** secret, only while rotating the key — the previous key, still accepted for decryption */
  ENCRYPTION_KEY_PREVIOUS?: string;
  /** secret — Brevo transactional API key */
  BREVO_API_KEY: string;
  /** local development: the email `npm run db:seed` makes the Admin (sign in with it on the login page) */
  DEV_USER_EMAIL?: string;
  /**
   * PBKDF2 iterations for new password hashes (default and maximum 100000, minimum 10000).
   * Lower it only if sign-ins hit the free plan's CPU limit — see docs/SECURITY.md.
   */
  PBKDF2_ITERATIONS?: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** what the role allows, resolved once per request */
  permissions: Permission[];
}

export type AppEnv = {
  Bindings: Env;
  Variables: {
    email: string;
    /** null when the email isn't an active portal user */
    user: AuthUser | null;
    db: Db;
    /** per request, in logs and in error responses */
    requestId: string;
    /** how this request is signed in */
    via: 'password' | 'access' | 'dev';
    /** the portal session (password sign-in only) */
    sessionId?: string;
  };
};
