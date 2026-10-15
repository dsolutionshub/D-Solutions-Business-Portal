/**
 * AES-256-GCM encryption for project secrets (Web Crypto — runs in the Worker and in Node).
 *
 *   key        ENCRYPTION_KEY, base64 of 32 random bytes (npm run gen:key)
 *   iv         12 random bytes, new for every encryption — never reused with the same key
 *   aad        "additional authenticated data" naming where the value belongs (project + field).
 *              It isn't stored or secret, but decryption fails if the ciphertext is moved to
 *              another row, so a swapped value can't be revealed under the wrong label.
 *
 * Ciphertext and iv are stored as base64 text. Plaintext is never logged.
 */

export interface Encrypted {
  ciphertext: string;
  iv: string;
}

const IV_BYTES = 12;
const KEY_BYTES = 32;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

type AesKey = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

const keyCache = new Map<string, Promise<AesKey>>();

/** Import (and cache) the AES key. Throws if ENCRYPTION_KEY is missing or not 32 bytes. */
export function importKey(base64Key: string): Promise<AesKey> {
  let key = keyCache.get(base64Key);
  if (!key) {
    let raw: Uint8Array<ArrayBuffer>;
    try {
      raw = fromBase64(base64Key.trim());
    } catch {
      throw new Error('ENCRYPTION_KEY is not valid base64. Generate one with `npm run gen:key`.');
    }
    if (raw.length !== KEY_BYTES)
      throw new Error(
        `ENCRYPTION_KEY must be ${KEY_BYTES} bytes (got ${raw.length}). Generate one with \`npm run gen:key\`.`
      );
    key = crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    keyCache.set(base64Key, key);
  }
  return key;
}

const params = (iv: Uint8Array<ArrayBuffer>, aad?: string): Parameters<typeof crypto.subtle.encrypt>[0] =>
  aad === undefined ? { name: 'AES-GCM', iv } : { name: 'AES-GCM', iv, additionalData: encoder.encode(aad) };

export async function encrypt(plain: string, base64Key: string, aad?: string): Promise<Encrypted> {
  const key = await importKey(base64Key);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const sealed = await crypto.subtle.encrypt(params(iv, aad), key, encoder.encode(plain));
  return { ciphertext: toBase64(new Uint8Array(sealed)), iv: toBase64(iv) };
}

/** Throws if the key, iv or aad is wrong or the ciphertext was tampered with. */
export async function decrypt(value: Encrypted, base64Key: string, aad?: string): Promise<string> {
  const key = await importKey(base64Key);
  try {
    const plain = await crypto.subtle.decrypt(
      params(fromBase64(value.iv), aad),
      key,
      fromBase64(value.ciphertext)
    );
    return decoder.decode(plain);
  } catch {
    throw new Error('Could not decrypt this secret (wrong key, or the data was changed).');
  }
}

/**
 * Decrypt with the current key, falling back to the previous one while a key rotation is under
 * way (ENCRYPTION_KEY_PREVIOUS — see scripts/rotate-key.ts and docs/OPERATIONS.md).
 */
export async function decryptWithKeys(
  value: Encrypted,
  keys: readonly string[],
  aad?: string
): Promise<string> {
  let last: unknown;
  for (const k of keys)
    try {
      return await decrypt(value, k, aad);
    } catch (err) {
      last = err;
    }
  throw last ?? new Error('No encryption key configured.');
}

/** The keys to try, newest first. */
export const decryptionKeys = (env: { ENCRYPTION_KEY: string; ENCRYPTION_KEY_PREVIOUS?: string }) =>
  [env.ENCRYPTION_KEY, env.ENCRYPTION_KEY_PREVIOUS].filter((k): k is string => !!k);

/** AAD for a secret sheet field, e.g. "project-secret:pj_p1:db.password". */
export const secretAad = (projectId: string, fieldKey: string) => `project-secret:${projectId}:${fieldKey}`;

/** AAD for a secret "other key". */
export const extraKeyAad = (projectId: string, extraKeyId: string) => `extra-key:${projectId}:${extraKeyId}`;
