// Create the backup encryption key pair (age, X25519) without installing the age tool.
//
//   npm run backup:keygen -- --out C:\safe\dsol-backup-key.txt
//
// Writes the PRIVATE key to --out (keep it offline: password manager, USB in a safe — never in the
// repo, GitHub or Cloudflare) and the PUBLIC key to backup/age-recipient.txt (commit that one).
import { generateIdentity, identityToRecipient } from 'age-encryption';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { argValue, fail, root } from './lib.mjs';

const out = argValue('--out');
if (!out) fail('Pass --out <path outside this repository> for the private key file.');
const outPath = path.resolve(out);
if (outPath.startsWith(root + path.sep)) fail('Keep the private key OUTSIDE the repository folder.');
if (existsSync(outPath)) fail(`${outPath} already exists — not overwriting a key.`);

const identity = await generateIdentity();
const recipient = await identityToRecipient(identity);
writeFileSync(outPath, `# created: ${new Date().toISOString()}\n# public key: ${recipient}\n${identity}\n`, {
  mode: 0o600
});
writeFileSync(path.join(root, 'backup', 'age-recipient.txt'), recipient + '\n');
console.log(`✔ Private key: ${outPath}  ← keep offline, you need it to restore`);
console.log(`✔ Public key written to backup/age-recipient.txt: ${recipient}  ← commit this`);
