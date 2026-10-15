/**
 * Password hashing and random tokens (WebCrypto — works in the Worker and in Node for the seed).
 *
 * Passwords: PBKDF2-HMAC-SHA256 with a random 16-byte salt, 100,000 iterations (the most Cloudflare
 * Workers allow), stored as "pbkdf2-sha256$<iterations>$<salt>$<hash>". The iteration count is
 * stored with each hash, so it can be raised later: a login with an older count re-hashes.
 *
 * Tokens (session cookies, reset links): 32 random bytes, base64url. Only their SHA-256 is stored.
 */

/** The most Cloudflare Workers allow, and the default. */
export const PBKDF2_ITERATIONS = 100_000;
const MIN_ITERATIONS = 10_000;

/** The iteration count to use: PBKDF2_ITERATIONS from the environment, kept within 10,000–100,000. */
export const iterationsFrom = (env: { PBKDF2_ITERATIONS?: string }) => {
  const n = Number(env.PBKDF2_ITERATIONS);
  return Number.isInteger(n) && n > 0
    ? Math.min(PBKDF2_ITERATIONS, Math.max(MIN_ITERATIONS, n))
    : PBKDF2_ITERATIONS;
};
const SALT_BYTES = 16;
const HASH_BYTES = 32;

const enc = new TextEncoder();

export const b64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const fromB64url = (s: string) => {
  const b64 = s
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(s.length / 4) * 4, '=');
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
};

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFKC')), 'PBKDF2', false, [
    'deriveBits'
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    HASH_BYTES * 8
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string, iterations = PBKDF2_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  return `pbkdf2-sha256$${iterations}$${b64url(salt)}$${b64url(await derive(password, salt, iterations))}`;
}

/** Constant-time comparison. */
function same(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export interface VerifyResult {
  ok: boolean;
  /** true when the hash used a different iteration count than the current setting: store a fresh hash */
  needsRehash: boolean;
}

export async function verifyPassword(
  password: string,
  stored: string | null | undefined,
  target = PBKDF2_ITERATIONS
): Promise<VerifyResult> {
  // Unknown user or no password yet: still do the same work, so timing doesn't reveal which emails exist.
  const parts = stored?.split('$') ?? [];
  if (parts.length !== 4 || parts[0] !== 'pbkdf2-sha256') {
    await derive(password, new Uint8Array(SALT_BYTES), target);
    return { ok: false, needsRehash: false };
  }
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > PBKDF2_ITERATIONS)
    return { ok: false, needsRehash: false };
  const ok = same(await derive(password, fromB64url(parts[2]!), iterations), fromB64url(parts[3]!));
  return { ok, needsRehash: ok && iterations !== target };
}

/** A new random token (for a cookie or a link). */
export const newToken = () => b64url(crypto.getRandomValues(new Uint8Array(32)));

/** What is stored for a token. */
export const tokenHash = async (token: string) =>
  b64url(await crypto.subtle.digest('SHA-256', enc.encode(token)));
