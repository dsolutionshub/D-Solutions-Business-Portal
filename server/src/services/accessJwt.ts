/**
 * Cloudflare Access token verification.
 *
 * Access puts a signed JWT in the `Cf-Access-Jwt-Assertion` header of every request it lets
 * through (and in the CF_Authorization cookie). The plain `Cf-Access-Authenticated-User-Email`
 * header is NOT trusted on its own: anyone who can reach the Worker directly could set it.
 *
 * Checked: RS256 signature against the team's public keys
 * (https://<team>.cloudflareaccess.com/cdn-cgi/access/certs, cached), `aud` contains the
 * application's AUD tag, `iss` is the team domain, `exp` / `nbf` (60 s clock skew).
 */

export interface AccessConfig {
  teamDomain: string;
  aud: string;
}

export interface AccessIdentity {
  email: string;
  sub: string;
  exp: number;
}

export class AccessTokenError extends Error {}

interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
}

const SKEW_S = 60;
const CERTS_TTL_MS = 60 * 60_000;
/** Don't hammer the certs endpoint when a token carries an unknown key id. */
const REFETCH_MIN_MS = 30_000;

/** Per isolate: certs by team domain. */
const cache = new Map<string, { keys: Map<string, CryptoKeyLike>; fetchedAt: number }>();
type CryptoKeyLike = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

export const certsUrl = (teamDomain: string) => `https://${teamDomain}/cdn-cgi/access/certs`;

/** For tests. */
export const clearCertsCache = () => cache.clear();

async function loadKeys(teamDomain: string, force: boolean) {
  const hit = cache.get(teamDomain);
  const now = Date.now();
  if (hit) {
    const age = now - hit.fetchedAt;
    // normal use: keep keys for an hour; unknown key id: refetch, but at most every 30 s
    if (!force && age < CERTS_TTL_MS) return hit.keys;
    if (force && age < REFETCH_MIN_MS) return hit.keys;
  }
  const res = await fetch(certsUrl(teamDomain), { cf: { cacheTtl: 300 } } as RequestInit);
  if (!res.ok) throw new AccessTokenError(`Could not load Access certificates (${res.status}).`);
  const body = (await res.json()) as { keys?: Jwk[] };
  const keys = new Map<string, CryptoKeyLike>();
  for (const k of body.keys ?? []) {
    if (k.kty !== 'RSA') continue;
    keys.set(
      k.kid,
      await crypto.subtle.importKey(
        'jwk',
        { kty: 'RSA', n: k.n, e: k.e, alg: 'RS256', ext: true },
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify']
      )
    );
  }
  cache.set(teamDomain, { keys, fetchedAt: now });
  return keys;
}

const b64urlBytes = (s: string) => {
  const b64 = s
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(s.length / 4) * 4, '=');
  const bin = atob(b64);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
};
const b64urlJson = (s: string) =>
  JSON.parse(new TextDecoder().decode(b64urlBytes(s))) as Record<string, unknown>;

export async function verifyAccessJwt(
  token: string,
  cfg: AccessConfig,
  nowS = Math.floor(Date.now() / 1000)
): Promise<AccessIdentity> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new AccessTokenError('Malformed token.');
  const [h, p, sig] = parts as [string, string, string];
  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  try {
    header = b64urlJson(h);
    payload = b64urlJson(p);
  } catch {
    throw new AccessTokenError('Malformed token.');
  }
  if (header.alg !== 'RS256' || typeof header.kid !== 'string')
    throw new AccessTokenError('Unexpected token algorithm.');

  let keys = await loadKeys(cfg.teamDomain, false);
  if (!keys.has(header.kid)) keys = await loadKeys(cfg.teamDomain, true);
  const key = keys.get(header.kid);
  if (!key) throw new AccessTokenError('Unknown signing key.');
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlBytes(sig),
    new TextEncoder().encode(`${h}.${p}`)
  );
  if (!ok) throw new AccessTokenError('Bad signature.');

  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(cfg.aud)) throw new AccessTokenError('Token is for another application.');
  if (payload.iss !== `https://${cfg.teamDomain}`) throw new AccessTokenError('Token from another issuer.');
  if (typeof payload.exp !== 'number' || payload.exp + SKEW_S < nowS)
    throw new AccessTokenError('Token expired.');
  if (typeof payload.nbf === 'number' && payload.nbf - SKEW_S > nowS)
    throw new AccessTokenError('Token not valid yet.');
  if (typeof payload.email !== 'string' || !payload.email) throw new AccessTokenError('Token has no email.');
  return { email: payload.email.trim().toLowerCase(), sub: String(payload.sub ?? ''), exp: payload.exp };
}

/** The token from the header Access adds, or from its cookie. */
export function accessToken(headers: { get(name: string): string | null | undefined }): string | null {
  const h = headers.get('Cf-Access-Jwt-Assertion');
  if (h) return h;
  const cookie = headers.get('Cookie') ?? '';
  const m = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(cookie);
  return m ? decodeURIComponent(m[1]!) : null;
}
