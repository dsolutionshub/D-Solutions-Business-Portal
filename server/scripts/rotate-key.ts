/**
 * Re-encrypt every project secret and secret "other key" with a new ENCRYPTION_KEY.
 *
 *   OLD_KEY=<current key> NEW_KEY=<new key> npm run rotate-key -- --env production           (dry run)
 *   OLD_KEY=<current key> NEW_KEY=<new key> npm run rotate-key -- --env production --apply   (writes)
 *
 * Targets: --local (wrangler dev data), --env staging, --env production.
 * Keys are read from environment variables only (never arguments, so they stay out of shell history).
 * The dry run decrypts every row with OLD_KEY and stops if any fails. --apply writes the new
 * ciphertexts (only rows still holding the old ciphertext are touched), then reads everything back
 * and checks it decrypts with NEW_KEY. Run it while the Worker has NEW_KEY as ENCRYPTION_KEY and
 * OLD_KEY as ENCRYPTION_KEY_PREVIOUS, so reveals keep working throughout (docs/OPERATIONS.md).
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { decrypt, encrypt, extraKeyAad, secretAad } from '../src/services/crypto';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const envName = args.includes('--env') ? args[args.indexOf('--env') + 1] : null;
const target = args.includes('--local') ? ['--local'] : envName ? ['--remote', '--env', envName] : null;
const OLD = process.env.OLD_KEY;
const NEW = process.env.NEW_KEY;

function fail(msg: string): never {
  console.error('✘ ' + msg);
  process.exit(1);
}
if (!target) fail('Choose a target: --local, --env staging or --env production.');
if (!OLD || !NEW) fail('Set OLD_KEY and NEW_KEY in the environment (not as arguments).');
if (OLD === NEW) fail('OLD_KEY and NEW_KEY are the same.');
for (const [name, k] of [
  ['OLD_KEY', OLD],
  ['NEW_KEY', NEW]
] as const)
  if (Buffer.from(k, 'base64').length !== 32)
    fail(`${name} is not a base64 32-byte key (npm run gen:key makes one).`);

const wrangler = (extra: string[]) => {
  const r = spawnSync('npx', ['wrangler', 'd1', 'execute', 'DB', ...target!, ...extra], {
    cwd: path.resolve(import.meta.dirname, '..'), // server/, where wrangler.toml is
    encoding: 'utf8',
    shell: process.platform === 'win32'
  });
  if (r.status !== 0) fail('wrangler failed:\n' + (r.stderr || r.stdout));
  return r.stdout;
};
const query = <T>(sql: string): T[] => {
  const out = wrangler(['--json', '--command', JSON.stringify(sql)]);
  const parsed = JSON.parse(out.slice(out.indexOf('['))) as { results: T[] }[];
  return parsed.flatMap(p => p.results);
};
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

type SecretRow = { project_id: string; field_key: string; ciphertext: string; iv: string };
type ExtraRow = { id: string; project_id: string; ciphertext: string; iv: string };

const secrets = query<SecretRow>('SELECT project_id, field_key, ciphertext, iv FROM project_secrets');
const extras = query<ExtraRow>('SELECT id, project_id, ciphertext, iv FROM extra_keys WHERE is_secret = 1');
console.log(
  `Found ${secrets.length} secret field(s) and ${extras.length} secret other key(s) (${target.join(' ')}).`
);

const updates: string[] = [];
let alreadyNew = 0;
async function rotate(row: { ciphertext: string; iv: string }, aad: string, where: string, label: string) {
  let plain: string;
  try {
    plain = await decrypt(row, OLD!, aad);
  } catch {
    try {
      await decrypt(row, NEW!, aad);
      alreadyNew++;
      return;
    } catch {
      fail(`${label} decrypts with neither key — stop and investigate (nothing was written).`);
    }
  }
  const next = await encrypt(plain, NEW!, aad);
  updates.push(
    `${where.replace('{set}', `ciphertext = ${q(next.ciphertext)}, iv = ${q(next.iv)}`)} AND ciphertext = ${q(row.ciphertext)};`
  );
}

for (const r of secrets)
  await rotate(
    r,
    secretAad(r.project_id, r.field_key),
    `UPDATE project_secrets SET {set} WHERE project_id = ${q(r.project_id)} AND field_key = ${q(r.field_key)}`,
    `${r.project_id} ${r.field_key}`
  );
for (const r of extras)
  await rotate(
    r,
    extraKeyAad(r.project_id, r.id),
    `UPDATE extra_keys SET {set} WHERE id = ${q(r.id)}`,
    `other key ${r.id}`
  );

console.log(`✔ All rows decrypt. To re-encrypt: ${updates.length}; already on the new key: ${alreadyNew}.`);
if (!apply) {
  console.log('Dry run — nothing written. Re-run with --apply to write.');
  process.exit(0);
}
if (!updates.length) {
  console.log('Nothing to do.');
  process.exit(0);
}

const dir = mkdtempSync(path.join(tmpdir(), 'dsol-rotate-'));
const file = path.join(dir, 'rotate.sql');
try {
  writeFileSync(file, updates.join('\n') + '\n', { mode: 0o600 });
  wrangler(['--file', file, '--yes']);
} finally {
  rmSync(dir, { recursive: true, force: true }); // the SQL holds only ciphertext, but don't leave it lying around
}

// verify: everything decrypts with the new key now
let bad = 0;
for (const r of query<SecretRow>('SELECT project_id, field_key, ciphertext, iv FROM project_secrets'))
  await decrypt(r, NEW, secretAad(r.project_id, r.field_key)).catch(() => bad++);
for (const r of query<ExtraRow>('SELECT id, project_id, ciphertext, iv FROM extra_keys WHERE is_secret = 1'))
  await decrypt(r, NEW, extraKeyAad(r.project_id, r.id)).catch(() => bad++);
if (bad)
  fail(
    `${bad} row(s) don't decrypt with NEW_KEY after writing. Keep ENCRYPTION_KEY_PREVIOUS set and investigate.`
  );
console.log('✔ Re-encrypted and verified. You can now remove ENCRYPTION_KEY_PREVIOUS (docs/OPERATIONS.md).');
