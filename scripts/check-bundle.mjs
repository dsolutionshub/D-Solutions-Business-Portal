// Fails if the built client (client/dist) contains anything secret-looking: the demo secret,
// server-only variable names with values, private keys, Brevo keys or long base64 blobs that
// look like ciphertext. Runs in CI after the build and before every client deploy.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fail, root } from './lib.mjs';

const dist = path.join(root, 'client', 'dist');
const files = [];
const walk = d => {
  for (const f of readdirSync(d)) {
    const p = path.join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|css|html|json|txt|map)$/.test(f)) files.push(p);
  }
};
try {
  walk(dist);
} catch {
  fail('client/dist not found — build the client first (npm run build).');
}

const RULES = [
  ['demo secret value', /demo-placeholder-not-a-real-secret/],
  ['ENCRYPTION_KEY value', /ENCRYPTION_KEY\s*[:=]\s*["'`]?[A-Za-z0-9+/]{20,}/],
  ['Brevo API key', /xkeysib-[a-f0-9]{20,}/i],
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['age secret key', /AGE-SECRET-KEY-1[0-9A-Z]{20,}/],
  ['Cloudflare API token variable', /CLOUDFLARE_API_TOKEN\s*[:=]\s*["'`]?[A-Za-z0-9_-]{20,}/],
  // AES-GCM ciphertext as stored (base64, long) next to an iv
  ['ciphertext-like value', /"ciphertext"\s*:\s*"[A-Za-z0-9+/=]{24,}"/]
];

let problems = 0;
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  for (const [what, re] of RULES)
    if (re.test(text)) {
      console.error(`✘ ${what} in ${path.relative(root, f)}`);
      problems++;
    }
}
if (problems) fail(`${problems} problem(s): secrets must never reach the browser bundle.`);
console.log(`✔ Client bundle clean (${files.length} files checked).`);
