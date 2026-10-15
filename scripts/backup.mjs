// Export a D1 database, count rows per table (for the restore check), and encrypt the export with
// age for the public key in backup/age-recipient.txt. The plaintext export only ever exists in a
// private temp folder and is overwritten and deleted before this script ends.
//
//   node scripts/backup.mjs --env production [--out out]
//   node scripts/backup.mjs --local [--out out]          (restore drill on your machine)
//
// Writes <out>/d1-<env>-<stamp>.sql.age and <out>/counts-<stamp>.json.
import { Encrypter } from 'age-encryption';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { argValue, d1Query, dbTarget, fail, root, wrangler } from './lib.mjs';

const target = dbTarget();
const outDir = path.resolve(root, argValue('--out') ?? 'out');
const recipientFile = path.join(root, 'backup', 'age-recipient.txt');
const recipient = existsSync(recipientFile) ? readFileSync(recipientFile, 'utf8').trim() : '';
if (!/^age1[0-9a-z]{58}$/.test(recipient))
  fail(
    'backup/age-recipient.txt must hold your age public key (age1…). Run `npm run backup:keygen` (docs/OPERATIONS.md → Backups). Nothing was exported.'
  );

const stamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
mkdirSync(outDir, { recursive: true });
const tmp = mkdtempSync(path.join(tmpdir(), 'dsol-backup-'));
const plain = path.join(tmp, 'dump.sql');

try {
  console.log(`Exporting ${target.name}…`);
  wrangler(['d1', 'export', 'DB', ...target.flags, '--output', plain]);

  const tables = d1Query(
    target,
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name"
  ).map(t => t.name);
  const counts = {};
  for (const t of tables) counts[t] = d1Query(target, `SELECT count(*) AS n FROM "${t}"`)[0].n;
  const countsFile = path.join(outDir, `counts-${stamp}.json`);
  writeFileSync(countsFile, JSON.stringify(counts, null, 2) + '\n');

  const e = new Encrypter();
  e.addRecipient(recipient);
  const encrypted = path.join(outDir, `d1-${target.env}-${stamp}.sql.age`);
  writeFileSync(encrypted, await e.encrypt(readFileSync(plain)));
  console.log(
    `✔ ${path.relative(root, encrypted)} (${statSync(encrypted).size} bytes), ${tables.length} tables, counts in ${path.relative(root, countsFile)}`
  );

  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `stamp=${stamp}\n`);
} finally {
  // overwrite, then delete the plaintext export
  if (existsSync(plain)) writeFileSync(plain, Buffer.alloc(statSync(plain).size));
  rmSync(tmp, { recursive: true, force: true });
}
