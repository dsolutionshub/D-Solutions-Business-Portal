import {
  changePasswordSchema,
  escapeHtml,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  type Me
} from '@dsol/shared';
import { and, eq, ne } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { getDb, type Db } from '../db/client';
import {
  changePassword,
  createPasswordLink,
  login,
  logout,
  SESSION_MAX_MS,
  sessionUser,
  usePasswordLink
} from '../db/repos/auth';
import { sendEmail } from '../db/repos/emails';
import { auditEntry } from '../db/repos/util';
import { auditLog, users } from '../db/schema';
import { iterationsFrom } from '../services/password';
import type { AppEnv, Env } from '../env';
import { HttpError } from '../middleware/errors';
import { permissionsFor } from '../db/repos/roles';
import { validate } from '../middleware/validate';

/** The session cookie. `__Host-` (HTTPS, whole site, no Domain) when deployed; a plain name on http://localhost. */
export const sessionCookieName = (env: Pick<Env, 'ENVIRONMENT'>) =>
  env.ENVIRONMENT === 'development' ? 'dsol_session' : '__Host-dsol_session';

const cookieOptions = (env: Pick<Env, 'ENVIRONMENT'>) =>
  ({
    path: '/',
    httpOnly: true,
    secure: env.ENVIRONMENT !== 'development',
    sameSite: 'Lax',
    maxAge: Math.floor(SESSION_MAX_MS / 1000)
  }) as const;

export const sessionToken = (c: Context<AppEnv>) => getCookie(c, sessionCookieName(c.env));

/* Sign-in attempts per IP per minute, per Worker instance (account lockout is the real guard). */
const attempts = new Map<string, { start: number; count: number }>();
function throttle(c: Context<AppEnv>, max: number) {
  const ip = c.req.header('cf-connecting-ip') ?? 'local';
  const key = `${c.req.path}:${ip}`;
  const now = Date.now();
  const w = attempts.get(key);
  if (!w || now - w.start > 60_000) attempts.set(key, { start: now, count: 1 });
  else if (++w.count > max)
    throw new HttpError(429, 'rate_limited', 'Too many attempts. Wait a minute and try again.');
  if (attempts.size > 5000) attempts.clear();
}
export const resetSignInThrottle = () => attempts.clear();

/** Email a set-password (invite) or reset link. The history keeps a note, never the link. */
export async function sendPasswordEmail(
  db: Db,
  env: Env,
  user: { id: string; name: string; email: string },
  purpose: 'invite' | 'reset'
) {
  const token = await createPasswordLink(db, user.id, purpose);
  const base = (env.APP_URL ?? '').replace(/\/$/, '');
  const link = `${base}/reset-password?token=${encodeURIComponent(token)}${purpose === 'invite' ? '&invite=1' : ''}`;
  const first = escapeHtml(user.name.split(' ')[0] ?? user.name);
  const html =
    purpose === 'invite'
      ? `<p>Hi ${first},</p><p>You have been added to the D Solutions Business Portal. Choose your password to sign in:</p><p><a href="${escapeHtml(link)}">Set my password</a></p><p>The link works once, for 72 hours.</p>`
      : `<p>Hi ${first},</p><p>Someone (hopefully you) asked to reset your Business Portal password.</p><p><a href="${escapeHtml(link)}">Choose a new password</a></p><p>The link works once, for 1 hour. If you didn’t ask for this, ignore this email — your password stays the same.</p>`;
  const res = await sendEmail(
    db,
    env,
    {
      clientId: null,
      kind: 'account',
      to: [user.email],
      toText: user.name,
      subject:
        purpose === 'invite' ? 'Set your Business Portal password' : 'Reset your Business Portal password',
      html,
      template: purpose === 'invite' ? 'Account: set password' : 'Account: reset password',
      storedBody: `<p>${purpose === 'invite' ? 'Set-password' : 'Password reset'} link for ${escapeHtml(user.email)} (the link itself is not stored).</p>`
    },
    null
  );
  return { status: res?.status ?? 'Failed', devLink: env.ENVIRONMENT === 'development' ? link : undefined };
}

/** /api/auth — public: sign in, sign out, forgot / reset password */
export const authPublic = new Hono<AppEnv>()
  .post('/login', validate('json', loginSchema), async c => {
    throttle(c, 10);
    const db = getDb(c.env);
    const { email, password } = c.req.valid('json');
    const { token, userId } = await login(
      db,
      email,
      password,
      c.req.header('user-agent') ?? null,
      iterationsFrom(c.env)
    );
    setCookie(c, sessionCookieName(c.env), token, cookieOptions(c.env));
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    return c.json<Me>({
      email: u!.email,
      user: {
        id: u!.id,
        name: u!.name,
        email: u!.email,
        role: u!.role,
        permissions: await permissionsFor(db, u!.role)
      },
      via: 'password'
    });
  })
  .post('/logout', async c => {
    const token = sessionToken(c);
    if (token) await logout(getDb(c.env), token);
    deleteCookie(c, sessionCookieName(c.env), { path: '/', secure: c.env.ENVIRONMENT !== 'development' });
    return c.json({ ok: true });
  })
  .post('/forgot', validate('json', forgotPasswordSchema), async c => {
    throttle(c, 5);
    const db = getDb(c.env);
    const [u] = await db
      .select()
      .from(users)
      .where(and(eq(users.email, c.req.valid('json').email), ne(users.status, 'Deactivated')));
    let devLink: string | undefined;
    if (u) {
      const r = await sendPasswordEmail(db, c.env, u, u.passwordHash ? 'reset' : 'invite');
      devLink = r.devLink;
      await db.insert(auditLog).values(
        auditEntry({
          userId: u.id,
          action: 'auth.password_reset_requested',
          entity: 'user',
          entityId: u.id
        })
      );
    }
    // same answer whether or not the email exists
    return c.json({ ok: true, ...(devLink ? { devLink } : {}) });
  })
  .post('/reset', validate('json', resetPasswordSchema), async c => {
    throttle(c, 10);
    const { token, password } = c.req.valid('json');
    await usePasswordLink(getDb(c.env), token, password, iterationsFrom(c.env));
    return c.json({ ok: true });
  })
  /** Is anyone signed in? 200 either way (public pages ask this without causing a 401). */
  .get('/session', async c => {
    const token = sessionToken(c);
    const db = getDb(c.env);
    const s = token ? await sessionUser(db, token) : null;
    return c.json<{ user: Me['user'] }>({
      user: s
        ? {
            id: s.id,
            name: s.name,
            email: s.email,
            role: s.role,
            permissions: await permissionsFor(db, s.role)
          }
        : null
    });
  });

/** /api/account — the signed-in person's own account. */
export const account = new Hono<AppEnv>().post(
  '/password',
  validate('json', changePasswordSchema),
  async c => {
    const { current, password } = c.req.valid('json');
    await changePassword(
      c.get('db'),
      { id: c.get('user')!.id, sessionId: c.get('sessionId') },
      current,
      password,
      iterationsFrom(c.env)
    );
    return c.json({ ok: true });
  }
);
