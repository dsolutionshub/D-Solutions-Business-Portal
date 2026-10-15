/**
 * Portal sign-in: password check with lockout, sessions, set/reset-password links.
 *
 *   sessions        12 h after the last request, at most 7 days after sign-in
 *   lockout         5 wrong passwords in a row → locked for 15 minutes
 *   invite link     valid 72 h · reset link 1 h · single use
 */
import { and, eq, gt, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { HttpError } from '../../middleware/errors';
import {
  hashPassword,
  newToken,
  PBKDF2_ITERATIONS,
  tokenHash,
  verifyPassword
} from '../../services/password';
import type { Db } from '../client';
import { auditLog, passwordResets, sessions, users } from '../schema';
import { auditEntry } from './util';

export const SESSION_IDLE_MS = 12 * 3_600_000;
export const SESSION_MAX_MS = 7 * 24 * 3_600_000;
export const LOCK_AFTER = 5;
export const LOCK_MS = 15 * 60_000;
const LINK_TTL_MS = { invite: 72 * 3_600_000, reset: 3_600_000 } as const;
/** Don't write last-seen on every request. */
const SLIDE_EVERY_MS = 5 * 60_000;

export const wrongCredentials = () =>
  new HttpError(401, 'bad_credentials', 'Email or password is incorrect.');

export interface SessionUser {
  sessionId: string;
  id: string;
  email: string;
  name: string;
  role: (typeof users.$inferSelect)['role'];
}

/** Check email + password; on success start a session and return its token. */
export async function login(
  db: Db,
  email: string,
  password: string,
  userAgent: string | null,
  iterations = PBKDF2_ITERATIONS,
  now = new Date()
) {
  const [u] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
  const active = u && u.status !== 'Deactivated';

  if (active && u.lockedUntil && Date.parse(u.lockedUntil) > now.getTime()) {
    const mins = Math.ceil((Date.parse(u.lockedUntil) - now.getTime()) / 60_000);
    throw new HttpError(
      429,
      'locked',
      `Too many wrong passwords. Try again in ${mins} minute${mins === 1 ? '' : 's'}, or reset your password.`
    );
  }

  // always hash, so a wrong email takes as long as a wrong password
  const result = await verifyPassword(password, active ? u.passwordHash : null, iterations);
  if (!active || !result.ok) {
    if (active) {
      const failures = u.failedLogins + 1;
      const lock = failures >= LOCK_AFTER;
      await db.batch([
        db
          .update(users)
          .set({
            failedLogins: lock ? 0 : failures,
            lockedUntil: lock ? new Date(now.getTime() + LOCK_MS).toISOString() : null
          })
          .where(eq(users.id, u.id)),
        db.insert(auditLog).values(
          auditEntry({
            userId: u.id,
            action: lock ? 'auth.locked' : 'auth.login_failed',
            entity: 'user',
            entityId: u.id,
            meta: { failures }
          })
        )
      ]);
    }
    throw wrongCredentials();
  }

  const token = newToken();
  const iso = now.toISOString();
  await db.batch([
    db.insert(sessions).values({
      id: await tokenHash(token),
      userId: u.id,
      expiresAt: new Date(now.getTime() + SESSION_IDLE_MS).toISOString(),
      absoluteExpiresAt: new Date(now.getTime() + SESSION_MAX_MS).toISOString(),
      lastSeenAt: iso,
      userAgent: userAgent?.slice(0, 200) ?? null
    }),
    db
      .update(users)
      .set({
        failedLogins: 0,
        lockedUntil: null,
        lastLoginAt: iso,
        status: sql`CASE WHEN ${users.status} = 'Invited' THEN 'Active' ELSE ${users.status} END`,
        // a hash made with another iteration count is replaced on a successful sign-in
        ...(result.needsRehash ? { passwordHash: await hashPassword(password, iterations) } : {})
      })
      .where(eq(users.id, u.id)),
    db
      .insert(auditLog)
      .values(auditEntry({ userId: u.id, action: 'auth.login', entity: 'user', entityId: u.id }))
  ]);
  return { token, userId: u.id };
}

/** The user behind a session token, or null. Slides the idle expiry forward (at most every 5 min). */
export async function sessionUser(db: Db, token: string, now = new Date()): Promise<SessionUser | null> {
  const id = await tokenHash(token);
  const iso = now.toISOString();
  const [row] = await db
    .select({ s: sessions, u: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.id, id),
        gt(sessions.expiresAt, iso),
        gt(sessions.absoluteExpiresAt, iso),
        ne(users.status, 'Deactivated')
      )
    );
  if (!row) return null;
  if (now.getTime() - Date.parse(row.s.lastSeenAt) > SLIDE_EVERY_MS) {
    const idle = new Date(
      Math.min(now.getTime() + SESSION_IDLE_MS, Date.parse(row.s.absoluteExpiresAt))
    ).toISOString();
    await db.update(sessions).set({ lastSeenAt: iso, expiresAt: idle }).where(eq(sessions.id, id));
  }
  return { sessionId: id, id: row.u.id, email: row.u.email, name: row.u.name, role: row.u.role };
}

export async function logout(db: Db, token: string) {
  const id = await tokenHash(token);
  const [s] = await db.delete(sessions).where(eq(sessions.id, id)).returning({ userId: sessions.userId });
  if (s)
    await db
      .insert(auditLog)
      .values(auditEntry({ userId: s.userId, action: 'auth.logout', entity: 'user', entityId: s.userId }));
}

/** Sign someone out everywhere (deactivation, password reset). `except` keeps the current session. */
export async function endSessions(db: Db, userId: string, except?: string) {
  await db
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), except ? ne(sessions.id, except) : undefined));
}

/** A single-use link token to set (invite) or reset a password. Earlier unused links stop working. */
export async function createPasswordLink(
  db: Db,
  userId: string,
  purpose: 'invite' | 'reset',
  now = new Date()
) {
  const token = newToken();
  await db.batch([
    db
      .update(passwordResets)
      .set({ usedAt: now.toISOString() })
      .where(and(eq(passwordResets.userId, userId), isNull(passwordResets.usedAt))),
    db.insert(passwordResets).values({
      id: await tokenHash(token),
      userId,
      purpose,
      expiresAt: new Date(now.getTime() + LINK_TTL_MS[purpose]).toISOString()
    })
  ]);
  return token;
}

const badLink = () =>
  new HttpError(
    400,
    'link_invalid',
    'This link has expired or was already used. Ask for a new one on the sign-in page.'
  );

/** Use a set/reset link: store the new password, end every session, unlock. Returns the user id. */
export async function usePasswordLink(
  db: Db,
  token: string,
  password: string,
  iterations = PBKDF2_ITERATIONS,
  now = new Date()
) {
  const id = await tokenHash(token);
  const iso = now.toISOString();
  const [link] = await db
    .select({ r: passwordResets, status: users.status })
    .from(passwordResets)
    .innerJoin(users, eq(users.id, passwordResets.userId))
    .where(and(eq(passwordResets.id, id), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, iso)));
  if (!link || link.status === 'Deactivated') throw badLink();
  const userId = link.r.userId;
  // mark used only if still unused: two tabs submitting the same link can't both win
  const claimed = await db
    .update(passwordResets)
    .set({ usedAt: iso })
    .where(and(eq(passwordResets.id, id), isNull(passwordResets.usedAt)))
    .returning({ id: passwordResets.id });
  if (!claimed.length) throw badLink();
  await db.batch([
    db
      .update(users)
      .set({
        passwordHash: await hashPassword(password, iterations),
        passwordUpdatedAt: iso,
        failedLogins: 0,
        lockedUntil: null
      })
      .where(eq(users.id, userId)),
    db.delete(sessions).where(eq(sessions.userId, userId)),
    db.insert(auditLog).values(
      auditEntry({
        userId,
        action: 'auth.password_reset',
        entity: 'user',
        entityId: userId,
        meta: { purpose: link.r.purpose }
      })
    )
  ]);
  return userId;
}

/** Change your own password (knowing the current one). Other sessions end; this one stays. */
export async function changePassword(
  db: Db,
  user: { id: string; sessionId?: string },
  current: string,
  next: string,
  iterations = PBKDF2_ITERATIONS
) {
  const [u] = await db.select().from(users).where(eq(users.id, user.id));
  if (!u?.passwordHash)
    throw new HttpError(
      400,
      'no_password',
      'You sign in through Cloudflare Access, so there is no portal password to change.'
    );
  if (!(await verifyPassword(current, u.passwordHash)).ok)
    throw new HttpError(400, 'bad_request', 'Please fix the highlighted fields.', {
      current: 'That isn’t your current password.'
    });
  const iso = new Date().toISOString();
  await db.batch([
    db
      .update(users)
      .set({ passwordHash: await hashPassword(next, iterations), passwordUpdatedAt: iso })
      .where(eq(users.id, u.id)),
    db
      .delete(sessions)
      .where(and(eq(sessions.userId, u.id), user.sessionId ? ne(sessions.id, user.sessionId) : undefined)),
    db
      .insert(auditLog)
      .values(auditEntry({ userId: u.id, action: 'auth.password_change', entity: 'user', entityId: u.id }))
  ]);
}

/** Daily clean-up of expired sessions and links. */
export async function purgeExpired(db: Db, now = new Date()) {
  const iso = now.toISOString();
  await db.delete(sessions).where(or(lt(sessions.expiresAt, iso), lt(sessions.absoluteExpiresAt, iso)));
  await db
    .delete(passwordResets)
    .where(lt(passwordResets.expiresAt, new Date(now.getTime() - 7 * 86_400_000).toISOString()));
}
