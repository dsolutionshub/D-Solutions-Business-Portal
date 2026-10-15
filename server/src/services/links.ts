/**
 * Signed, expiring links to an invoice's or receipt's printable page, for emails to clients.
 * Clients don't sign in (Cloudflare Access only lets staff in), so these pages are served under
 * /api/public/… — which Access must bypass — and only answer with a valid signature.
 *
 *   sig = HMAC-SHA256(key, "<kind>:<id>:<exp>")   key derived from ENCRYPTION_KEY
 */
import type { Env } from '../env';

export type LinkKind = 'invoice' | 'receipt';

/** Links in emails work for this long. */
export const LINK_TTL_DAYS = 120;

const enc = new TextEncoder();
const b64url = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

async function hmacKey(secret: string) {
  // a separate key for links: HMAC over a label, so it is never the AES key itself
  const material = await crypto.subtle.digest('SHA-256', enc.encode('dsol-link-signing:' + secret));
  return crypto.subtle.importKey('raw', material, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

async function signature(secret: string, kind: LinkKind, id: string, exp: number) {
  const key = await hmacKey(secret);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(`${kind}:${id}:${exp}`)));
}

const PATHS: Record<LinkKind, (id: string) => string> = {
  invoice: no => `/api/public/invoices/${encodeURIComponent(no)}`,
  receipt: id => `/api/public/receipts/${encodeURIComponent(id)}`
};

export async function signedLink(
  env: Pick<Env, 'ENCRYPTION_KEY' | 'APP_URL'>,
  kind: LinkKind,
  id: string,
  now = Date.now()
): Promise<string> {
  const exp = Math.floor(now / 1000) + LINK_TTL_DAYS * 86_400;
  const sig = await signature(env.ENCRYPTION_KEY, kind, id, exp);
  return `${(env.APP_URL ?? '').replace(/\/$/, '')}${PATHS[kind](id)}?exp=${exp}&sig=${sig}`;
}

/** Constant-time check of a link's signature and expiry. */
export async function verifyLink(
  env: Pick<Env, 'ENCRYPTION_KEY'>,
  kind: LinkKind,
  id: string,
  exp: string | undefined,
  sig: string | undefined,
  now = Date.now()
): Promise<boolean> {
  const expN = Number(exp);
  if (!sig || !Number.isInteger(expN) || expN * 1000 < now) return false;
  const expected = await signature(env.ENCRYPTION_KEY, kind, id, expN);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}
