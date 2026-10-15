/**
 * Cloudflare Access: only a valid, signed Access token identifies a user outside development.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { accessJwt, createHarness, TEST_ACCESS, type Harness } from '../test/harness';

let h: Harness;
const OWNER = 'owner@test.example';
beforeAll(async () => {
  h = await createHarness({ DEV_USER_EMAIL: OWNER });
});
afterAll(() => h?.dispose());

const me = async (headers: Record<string, string>) => h.raw('/me', headers);

describe('Access token verification (production)', () => {
  it('accepts a valid token from the header or the CF_Authorization cookie', async () => {
    const token = await accessJwt(OWNER);
    expect((await me({ 'Cf-Access-Jwt-Assertion': token })).json.user.role).toBe('Admin');
    expect((await me({ Cookie: `other=1; CF_Authorization=${token}` })).json.user.role).toBe('Admin');
  });

  it('never trusts the email header on its own, nor DEV_USER_EMAIL', async () => {
    const forged = await me({ 'Cf-Access-Authenticated-User-Email': OWNER });
    expect(forged.status).toBe(401);
    expect((await me({})).status).toBe(401); // DEV_USER_EMAIL is set but ignored outside development
  });

  it('rejects tokens for another app, issuer, expired, not yet valid, or without email', async () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    for (const claims of [
      { aud: ['someone-else'] },
      { iss: 'https://evil.cloudflareaccess.com' },
      { exp: past },
      { nbf: Math.floor(Date.now() / 1000) + 3600 },
      { email: '' }
    ])
      expect(
        (await me({ 'Cf-Access-Jwt-Assertion': await accessJwt(OWNER, claims) })).status,
        JSON.stringify(claims)
      ).toBe(401);
  });

  it('rejects a token signed with another key, or tampered with', async () => {
    const other = (await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256'
      },
      true,
      ['sign', 'verify']
    )) as CryptoKeyPair;
    expect(
      (await me({ 'Cf-Access-Jwt-Assertion': await accessJwt(OWNER, {}, other.privateKey) })).status
    ).toBe(401);
    const [hd, , sig] = (await accessJwt('stranger@test.example')).split('.');
    const swapped = (await accessJwt(OWNER)).split('.')[1];
    expect((await me({ 'Cf-Access-Jwt-Assertion': `${hd}.${swapped}.${sig}` })).status).toBe(401);
    expect((await me({ 'Cf-Access-Jwt-Assertion': 'not.a.jwt' })).status).toBe(401);
  });

  it('rejects a token whose email disagrees with the email header', async () => {
    const r = await me({
      'Cf-Access-Jwt-Assertion': await accessJwt('stranger@test.example'),
      'Cf-Access-Authenticated-User-Email': OWNER
    });
    expect(r.status).toBe(401);
  });

  it('a valid token for an unknown email reaches /me but nothing else', async () => {
    const token = await accessJwt('stranger@test.example');
    const r = await me({ 'Cf-Access-Jwt-Assertion': token });
    expect(r.json).toEqual({ email: 'stranger@test.example', user: null, via: 'access' });
    expect((await h.raw('/clients', { 'Cf-Access-Jwt-Assertion': token })).status).toBe(403);
  });

  it('the audience and team come from the environment', () => {
    expect(TEST_ACCESS.aud).toBe(h.env.ACCESS_AUD);
  });
});

describe('local development', () => {
  it('has no automatic sign-in: only a session, or the email header that automated tests send', async () => {
    const dev = await createHarness({ ENVIRONMENT: 'development', DEV_USER_EMAIL: OWNER });
    try {
      expect((await dev.raw('/me', {})).status).toBe(401);
      const r = await dev.raw('/me', { 'Cf-Access-Authenticated-User-Email': 'dev@test.example' });
      expect(r.json).toMatchObject({ user: { role: 'Developer' }, via: 'dev' });
    } finally {
      await dev.dispose();
    }
  });
});
