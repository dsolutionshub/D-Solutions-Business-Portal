// Restore an encrypted D1 backup (from the weekly backup workflow) into an environment, then check
// the row counts against the backup's counts file. The restore drill (docs/OPERATIONS.md) runs this
// against STAGING.
//
//   node scripts/restore.mjs --env staging --file d1-production-….sql.age --identity ~/dsol-backup-key.txt --counts counts-….json
//   node scripts/restore.mjs --local --file … --identity … --counts …     (drill on your machine)
//
// Replaces EVERYTHING in the target database. Production additionally needs
// --i-understand-this-replaces-production (for production, D1 Time Travel is usually the better tool).
import { Decrypter } from 'age-encryption';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { argValue, d1Query, dbTarget, fail, wrangler } from './lib.mjs';

const target = dbTarget();
const file = argValue('--file');
const identityFile = argValue('--identity');
const countsFile = argValue('--counts');
if (target.env === 'production' && !process.argv.includes('--i-understand-this-replaces-production'))
  fail('Refusing to restore over production without --i-understand-this-replaces-production.');
if (!file || !existsSync(file)) fail('Pass --file <backup .sql.age>.');
if (!identityFile || !existsSync(identityFile)) fail('Pass --identity <your age private key file>.');

const identity = readFileSync(identityFile, 'utf8')
  .split(/\r?\n/)
  .find(l => l.startsWith('AGE-SECRET-KEY-'));
if (!identity) fail(`${identityFile} has no AGE-SECRET-KEY line.`);

const dir = mkdtempSync(path.join(tmpdir(), 'dsol-restore-'));
const plain = path.join(dir, 'dump.sql');
const userTables = () =>
  d1Query(
    target,
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name"
  ).map(t => t.name);

try {
  console.log('Decrypting…');
  const d = new Decrypter();
  d.addIdentity(identity);
  let dump;
  try {
    dump = await d.decrypt(readFileSync(file), 'text');
  } catch {
    fail('Could not decrypt — wrong key file, or the backup is damaged.');
  }
  if (!/CREATE TABLE/i.test(dump)) fail('The decrypted file does not look like a D1 export.');
  // D1 exports tables alphabetically, so a row can arrive before the table its foreign key points
  // to exists. Load in three passes: every table, then every row, then indexes.
  const statements = splitSql(dump).filter(s => !/^PRAGMA\b/i.test(s));
  const isTable = s => /^CREATE TABLE\b/i.test(s);
  const isIndex = s => /^CREATE (UNIQUE )?INDEX\b/i.test(s);
  const ordered = [
    'PRAGMA defer_foreign_keys = on;',
    ...statements.filter(isTable),
    ...statements.filter(s => !isTable(s) && !isIndex(s)),
    ...statements.filter(isIndex)
  ];
  writeFileSync(plain, ordered.map(s => (s.endsWith(';') ? s : s + ';')).join('\n') + '\n', { mode: 0o600 });

  console.log(`Clearing the ${target.name} database…`);
  const tables = userTables();
  if (tables.length) {
    const drop = path.join(dir, 'drop.sql');
    writeFileSync(
      drop,
      'PRAGMA defer_foreign_keys = on;\n' + tables.map(t => `DROP TABLE IF EXISTS "${t}";`).join('\n') + '\n'
    );
    wrangler(['d1', 'execute', 'DB', ...target.flags, '--file', drop, '--yes']);
  }

  console.log('Loading the backup…');
  wrangler(['d1', 'execute', 'DB', ...target.flags, '--file', plain, '--yes']);

  const counts = Object.fromEntries(
    userTables().map(t => [t, d1Query(target, `SELECT count(*) AS n FROM "${t}"`)[0].n])
  );
  console.table(counts);
  if (countsFile) {
    const expected = JSON.parse(readFileSync(countsFile, 'utf8'));
    const diff = Object.entries(expected).filter(([t, n]) => counts[t] !== n);
    if (diff.length)
      fail(
        'Row counts differ from the backup: ' +
          diff.map(([t, n]) => `${t} ${counts[t] ?? 'missing'} ≠ ${n}`).join(', ')
      );
    console.log(`✔ Row counts match the backup (${Object.keys(expected).length} tables).`);
  }
  console.log(
    `\n✔ Restored into ${target.name}. Sign in and spot-check a client, an invoice and a secret reveal.`
  );
} finally {
  // never leave the plaintext export behind
  if (existsSync(plain)) writeFileSync(plain, Buffer.alloc(statSync(plain).size));
  rmSync(dir, { recursive: true, force: true });
}

/** Split SQL into statements on `;` outside quotes ('…' with '' escapes, "…", `…`). */
function splitSql(sql) {
  const out = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    cur += ch;
    if (quote) {
      if (ch === quote) {
        if (quote === "'" && sql[i + 1] === "'") cur += sql[++i];
        else quote = null;
      }
    } else if (ch === "'" || ch === '"' || ch === '`') quote = ch;
    else if (ch === ';') {
      if (cur.trim() !== ';') out.push(cur.trim());
      cur = '';
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
