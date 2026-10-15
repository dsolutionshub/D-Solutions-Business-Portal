/**
 * Portal passwords: sign in / out, lockout, sessions, forgot / reset / invite links, change
 * password, cross-site protection.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword } from '../services/password';
import { createHarness, mockBrevo, type Harness } from '../test/harness';
import { resetSignInThrottle } from './auth';

let h: Harness;
const OWNER = 'owner@test.example';
const DEV = 'dev@test.example';
const PASS = 'Correct-Horse-42';
let brevo: ReturnType<typeof mockBrevo> | null = null;

beforeAll(async () => {
  h = await createHarness();
  const hash = await hashPassword(PASS);
  await h.env.DB.prepare('UPDATE users SET password_hash = ?').bind(hash).run();
});
afterAll(() => h?.dispose());
beforeEach(() => resetSignInThrottle());
afterEach(() => {
  brevo?.restore();
  brevo = null;
});

const login = (email: string, password: string) => h.raw('/auth/login', {}, 'POST', { email, password });
const cookieOf = (r: { headers: Headers }) =>
  /(__Host-dsol_session=[^;]+)/.exec(r.headers.get('set-cookie') ?? '')?.[1] ?? '';
const linkIn = (html: string) =>
  /href="[^"]*reset-password\?token=([^"&]+)/.exec(html.replace(/&amp;/g, '&'))![1]!;

describe('sign in and out', () => {
  it('signs in with email + password and sets a secure session cookie', async () => {
    const r = await login('Owner@Test.example', PASS);
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ user: { role: 'Admin' }, via: 'password' });
    const setCookie = r.headers.get('set-cookie')!;
    expect(setCookie).toMatch(/^__Host-dsol_session=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Secure/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(r.text).not.toContain('pbkdf2');

    const me = await h.raw('/me', { Cookie: cookieOf(r) });
    expect(me.json).toMatchObject({ email: OWNER, via: 'password' });
    // the database keeps only a hash of the token
    const token = cookieOf(r).split('=')[1]!;
    expect((await h.sql('SELECT id FROM sessions WHERE id = ?', token)).length).toBe(0);
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const a = await login(OWNER, 'nope-nope-nope');
    const b = await login('nobody@test.example', 'nope-nope-nope');
    expect([a.status, b.status]).toEqual([401, 401]);
    expect(a.json.error.message).toBe('Email or password is incorrect.');
    expect(b.json.error.message).toBe(a.json.error.message);
  });

  it('locks the account after 5 wrong passwords, even for the right one, then unlocks', async () => {
    for (let i = 0; i < 5; i++) await login(DEV, 'wrong-password-1');
    resetSignInThrottle();
    const locked = await login(DEV, PASS);
    expect(locked.status).toBe(429);
    expect(locked.json.error.message).toMatch(/Try again in 15 minutes/);
    await h.env.DB.prepare("UPDATE users SET locked_until = '2000-01-01T00:00:00Z' WHERE email = ?")
      .bind(DEV)
      .run();
    expect((await login(DEV, PASS)).status).toBe(200);
    expect(
      (await h.sql<{ action: string }>("SELECT action FROM audit_log WHERE action LIKE 'auth.%'")).map(
        r => r.action
      )
    ).toContain('auth.locked');
  });

  it('signing out ends the session', async () => {
    const c = cookieOf(await login(OWNER, PASS));
    expect((await h.raw('/auth/logout', { Cookie: c }, 'POST')).status).toBe(200);
    expect((await h.raw('/me', { Cookie: c })).status).toBe(401);
  });

  it('expired sessions and deactivated people are out', async () => {
    const c = cookieOf(await login('accounts@test.example', PASS));
    await h.env.DB.prepare("UPDATE sessions SET expires_at = '2000-01-01T00:00:00Z'").run();
    expect((await h.raw('/me', { Cookie: c })).status).toBe(401);

    const c2 = cookieOf(await login('admin@test.example', PASS));
    await h.call('owner', 'PATCH', '/users/us_admin', { status: 'Deactivated' });
    expect((await h.raw('/me', { Cookie: c2 })).status).toBe(401);
    expect((await login('admin@test.example', PASS)).status).toBe(401);
    await h.call('owner', 'PATCH', '/users/us_admin', { status: 'Active' });
  });

  it('without a session or Access token, the API answers 401', async () => {
    expect((await h.raw('/clients', {})).status).toBe(401);
  });
});

describe('forgot / reset / invite', () => {
  it('forgot password always answers the same; the email link works once and ends old sessions', async () => {
    brevo = mockBrevo();
    const old = cookieOf(await login(OWNER, PASS));
    expect((await h.raw('/auth/forgot', {}, 'POST', { email: 'nobody@test.example' })).json).toEqual({
      ok: true
    });
    expect(brevo.calls).toHaveLength(0);
    expect((await h.raw('/auth/forgot', {}, 'POST', { email: OWNER })).json).toEqual({ ok: true });
    expect(brevo.calls).toHaveLength(1);
    const token = linkIn(brevo.calls[0].htmlContent);

    // the Email Center history never shows the link
    const stored = await h.sql<{ body_html: string; kind: string }>(
      "SELECT body_html, kind FROM emails WHERE kind = 'account'"
    );
    expect(stored[0]!.body_html).not.toContain(token);

    expect((await h.raw('/auth/reset', {}, 'POST', { token, password: 'short' })).status).toBe(400);
    expect((await h.raw('/auth/reset', {}, 'POST', { token, password: 'New-Secret-2026' })).status).toBe(200);
    expect((await h.raw('/auth/reset', {}, 'POST', { token, password: 'Other-Secret-2026' })).status).toBe(
      400
    ); // used
    expect((await h.raw('/me', { Cookie: old })).status).toBe(401);
    expect((await login(OWNER, PASS)).status).toBe(401);
    expect((await login(OWNER, 'New-Secret-2026')).status).toBe(200);
    await h.env.DB.prepare('UPDATE users SET password_hash = ? WHERE email = ?')
      .bind(await hashPassword(PASS), OWNER)
      .run();
  });

  it('an invited person sets their password from the invite email and becomes Active', async () => {
    brevo = mockBrevo();
    const r = await h.call('owner', 'POST', '/users', {
      name: 'Neha Joshi',
      email: 'neha@test.example',
      role: 'Developer'
    });
    expect(r.status).toBe(201);
    expect(r.json.passwordEmail.status).toBe('Sent');
    expect(brevo.calls[0].subject).toBe('Set your Business Portal password');
    const token = linkIn(brevo.calls[0].htmlContent);
    expect((await login('neha@test.example', 'anything-at-all')).status).toBe(401); // no password yet
    expect((await h.raw('/auth/reset', {}, 'POST', { token, password: 'Neha-Portal-2026' })).status).toBe(
      200
    );
    expect((await login('neha@test.example', 'Neha-Portal-2026')).status).toBe(200);
    expect(
      (await h.sql<{ status: string }>("SELECT status FROM users WHERE email = 'neha@test.example'"))[0]!
        .status
    ).toBe('Active');

    // an Admin can send a fresh link; only Admins
    expect((await h.call('admin', 'POST', `/users/${r.json.id}/password-link`)).status).toBe(403);
    expect((await h.call('owner', 'POST', `/users/${r.json.id}/password-link`)).json.status).toBe('Sent');
  });
});

describe('change password', () => {
  it('needs the current password; other sessions end, this one stays', async () => {
    const mine = cookieOf(await login(DEV, PASS));
    const other = cookieOf(await login(DEV, PASS));
    const bad = await h.raw('/account/password', { Cookie: mine }, 'POST', {
      current: 'wrong',
      password: 'Dev-Portal-2026'
    });
    expect(bad.status).toBe(400);
    expect(bad.json.error.fields.current).toMatch(/current password/);
    expect(
      (
        await h.raw('/account/password', { Cookie: mine }, 'POST', {
          current: PASS,
          password: 'Dev-Portal-2026'
        })
      ).status
    ).toBe(200);
    expect((await h.raw('/me', { Cookie: mine })).status).toBe(200);
    expect((await h.raw('/me', { Cookie: other })).status).toBe(401);
  });

  it('refuses weak passwords', async () => {
    const c = cookieOf(await login('accounts@test.example', PASS));
    for (const password of ['short', 'password123456', 'aaaaaaaaaaaa'])
      expect(
        (await h.raw('/account/password', { Cookie: c }, 'POST', { current: PASS, password })).status,
        password
      ).toBe(400);
  });
});

describe('cross-site protection', () => {
  it('refuses changes coming from another site', async () => {
    const c = cookieOf(await login(OWNER, PASS));
    const evil = await h.raw('/notices', { Cookie: c, Origin: 'https://evil.example' }, 'POST', {
      title: 'x',
      body: null,
      date: '2030-01-01',
      type: 'Other'
    });
    expect(evil.status).toBe(403);
    const cross = await h.raw('/notices', { Cookie: c, 'Sec-Fetch-Site': 'cross-site' }, 'POST', {
      title: 'x',
      body: null,
      date: '2030-01-01',
      type: 'Other'
    });
    expect(cross.status).toBe(403);
    const ours = await h.raw('/notices', { Cookie: c, Origin: 'https://portal.test' }, 'POST', {
      title: 'Ours',
      body: null,
      date: '2030-01-01',
      type: 'Other'
    });
    expect(ours.status).toBe(201);
  });
});
