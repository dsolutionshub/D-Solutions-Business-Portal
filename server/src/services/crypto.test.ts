import { describe, expect, it } from 'vitest';
import { decrypt, encrypt, importKey, secretAad } from './crypto';

const keyA = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => i)));
const keyB = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => 255 - i)));
const aad = secretAad('pj_p1', 'db.password');

describe('crypto (AES-256-GCM)', () => {
  it('round-trips a value', async () => {
    const plain = 'p@ss wörd — ₹ 🔑';
    const enc = await encrypt(plain, keyA, aad);
    expect(enc.ciphertext).not.toContain(plain);
    expect(await decrypt(enc, keyA, aad)).toBe(plain);
  });

  it('fails with the wrong key', async () => {
    const enc = await encrypt('secret', keyA, aad);
    await expect(decrypt(enc, keyB, aad)).rejects.toThrow(/Could not decrypt/);
  });

  it('uses a different IV (and ciphertext) every time', async () => {
    const a = await encrypt('same value', keyA, aad);
    const b = await encrypt('same value', keyA, aad);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(atob(a.iv)).toHaveLength(12);
  });

  it('fails when the ciphertext is moved to another project or field (AAD)', async () => {
    const enc = await encrypt('secret', keyA, secretAad('pj_p1', 'db.password'));
    await expect(decrypt(enc, keyA, secretAad('pj_p2', 'db.password'))).rejects.toThrow();
    await expect(decrypt(enc, keyA, secretAad('pj_p1', 'hosting.password'))).rejects.toThrow();
  });

  it('fails when the ciphertext is tampered with', async () => {
    const enc = await encrypt('secret', keyA, aad);
    const bytes = Uint8Array.from(atob(enc.ciphertext), c => c.charCodeAt(0));
    bytes[0] = bytes[0]! ^ 1;
    const tampered = { ...enc, ciphertext: btoa(String.fromCharCode(...bytes)) };
    await expect(decrypt(tampered, keyA, aad)).rejects.toThrow();
  });

  it('rejects a key that is not 32 bytes', () => {
    expect(() => importKey(btoa('too short'))).toThrow(/32 bytes/);
    expect(() => importKey('%%% not base64')).toThrow(/base64/);
  });
});
