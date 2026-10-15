import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { getCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { getDb } from '../db/client';
import { sessionUser } from '../db/repos/auth';
import { users } from '../db/schema';
import type { AppEnv, Env } from '../env';
import { sessionCookieName } from '../routes/auth';
import { accessToken, AccessTokenError, verifyAccessJwt } from '../services/accessJwt';
import { permissionsFor } from '../db/repos/roles';
import { forbidden, HttpError } from './errors';

const ACCESS_EMAIL_HEADER = 'Cf-Access-Authenticated-User-Email';

export const unauthenticated = () => new HttpError(401, 'unauthenticated', 'Please sign in.');

/**
 * Identity from Cloudflare Access, when there is no portal session:
 *   staging / production: a verified Access JWT (signature, audience, issuer, expiry), only if
 *     ACCESS_TEAM_DOMAIN and ACCESS_AUD are set (Access is optional — portal passwords work without it).
 *   development: the Access email header, which only automated tests send (no Access locally).
 * The plain email header is never trusted outside development.
 */
export async function accessIdentity(
  env: Env,
  headers: Headers
): Promise<{ email: string; via: 'access' | 'dev' } | null> {
  if (env.ENVIRONMENT === 'development') {
    const email = headers.get(ACCESS_EMAIL_HEADER)?.trim().toLowerCase();
    return email ? { email, via: 'dev' } : null;
  }
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null;
  const token = accessToken(headers);
  if (!token) return null;
  try {
    const id = await verifyAccessJwt(token, { teamDomain: env.ACCESS_TEAM_DOMAIN, aud: env.ACCESS_AUD });
    // if Access also sent the email header, it must agree with the token
    const header = headers.get(ACCESS_EMAIL_HEADER)?.trim().toLowerCase();
    if (header && header !== id.email) throw new AccessTokenError('Email header does not match the token.');
    return { email: id.email, via: 'access' };
  } catch (err) {
    if (err instanceof AccessTokenError) {
      console.warn(JSON.stringify({ level: 'warn', msg: 'access token rejected', reason: err.message }));
      throw unauthenticated();
    }
    throw err;
  }
}

/**
 * Who is calling: a portal session cookie (password sign-in), else a Cloudflare Access identity.
 * Nobody → 401 (the app sends them to the sign-in page). An Access identity that isn't an active
 * portal user gets `user = null`: /api/me still answers (the app shows "no access"); everything
 * else is refused by requireUser.
 */
export const auth = createMiddleware<AppEnv>(async (c, next) => {
  const db = getDb(c.env);
  c.set('db', db);
  const token = getCookie(c, sessionCookieName(c.env));
  if (token) {
    const s = await sessionUser(db, token);
    if (s) {
      c.set('email', s.email);
      c.set('user', {
        id: s.id,
        name: s.name,
        email: s.email,
        role: s.role,
        permissions: await permissionsFor(db, s.role)
      });
      c.set('via', 'password');
      c.set('sessionId', s.sessionId);
      return next();
    }
  }
  const id = await accessIdentity(c.env, c.req.raw.headers);
  if (!id) throw unauthenticated();
  const [row] = await db.select().from(users).where(eq(users.email, id.email)).limit(1);
  c.set('email', id.email);
  c.set('via', id.via);
  c.set(
    'user',
    row && row.status !== 'Deactivated'
      ? {
          id: row.id,
          name: row.name,
          email: row.email,
          role: row.role,
          permissions: await permissionsFor(db, row.role)
        }
      : null
  );
  await next();
});

/** Refuse requests from emails that aren't active portal users. */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get('user'))
    throw forbidden(
      `${c.get('email')} doesn’t have access to the portal, or access was turned off. Ask an Admin to add you in Team & Permissions.`
    );
  await next();
});

/**
 * Cross-site request protection for cookie sign-in: a change (POST/PUT/PATCH/DELETE) must come
 * from the app's own pages. Browsers send Origin and Sec-Fetch-Site on such requests; with the
 * SameSite=Lax cookie and JSON-only bodies this blocks CSRF.
 */
export const sameOriginWrites = createMiddleware<AppEnv>(async (c, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) return next();
  if (c.req.header('sec-fetch-site') === 'cross-site')
    throw forbidden('Cross-site requests are not allowed.');
  const origin = c.req.header('origin');
  if (origin) {
    const allowed = new Set([new URL(c.req.url).origin]);
    if (c.env.APP_URL) allowed.add(new URL(c.env.APP_URL).origin);
    for (const o of (c.env.CORS_ORIGINS ?? '').split(',')) if (o.trim()) allowed.add(o.trim());
    // local development: the Vite dev server (any local port) proxies to the Worker
    const local =
      c.env.ENVIRONMENT === 'development' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    if (!allowed.has(origin) && !local) throw forbidden('Cross-site requests are not allowed.');
  }
  await next();
});

/**
 * Record a sign-in at most once an hour per user (a single conditional UPDATE — no write when
 * recent). An invited user becomes Active on their first sign-in.
 */
export async function touchLastLogin(db: ReturnType<typeof getDb>, userId: string, now = new Date()) {
  const hourAgo = new Date(now.getTime() - 60 * 60_000).toISOString();
  await db
    .update(users)
    .set({
      lastLoginAt: now.toISOString(),
      status: sql`CASE WHEN ${users.status} = 'Invited' THEN 'Active' ELSE ${users.status} END`
    })
    .where(and(eq(users.id, userId), or(isNull(users.lastLoginAt), lt(users.lastLoginAt, hourAgo))));
}
