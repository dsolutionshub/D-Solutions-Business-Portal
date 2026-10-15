// Create the Cloudflare resources an environment needs, if they don't exist yet, and print what to
// paste into server/wrangler.toml. Safe to run again.
//
//   npm run setup:staging      (= node scripts/setup-cloudflare.mjs --env staging)
//   npm run setup:prod         (= node scripts/setup-cloudflare.mjs --env production)
//
// Needs `npx wrangler login` first (or CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID).
import { BACKUP_BUCKET, envArg, RESOURCES, wrangler } from './lib.mjs';

const env = envArg();
const r = RESOURCES[env];
console.log(`\nSetting up ${env}…\n`);

// D1
const dbs = JSON.parse(wrangler(['d1', 'list', '--json'], { capture: true }) || '[]');
let db = dbs.find(d => d.name === r.d1);
if (db) console.log(`✔ D1 database ${r.d1} exists`);
else {
  wrangler(['d1', 'create', r.d1]);
  db = JSON.parse(wrangler(['d1', 'list', '--json'], { capture: true })).find(d => d.name === r.d1);
  console.log(`✔ D1 database ${r.d1} created`);
}

// R2 (files, and — once — the backup bucket)
const buckets = wrangler(['r2', 'bucket', 'list'], { capture: true });
for (const bucket of [r.r2, ...(env === 'production' ? [BACKUP_BUCKET] : [])]) {
  if (buckets.includes(bucket)) console.log(`✔ R2 bucket ${bucket} exists`);
  else {
    wrangler(['r2', 'bucket', 'create', bucket]);
    console.log(`✔ R2 bucket ${bucket} created`);
  }
}

// Pages project
const pages = wrangler(['pages', 'project', 'list'], { capture: true, allowFail: true }) || '';
if (pages.includes(r.pages)) console.log(`✔ Pages project ${r.pages} exists`);
else {
  wrangler(['pages', 'project', 'create', r.pages, '--production-branch', r.pagesBranch]);
  console.log(`✔ Pages project ${r.pages} created (production branch: ${r.pagesBranch})`);
}

console.log(`
──────────────────────────────────────────────────────────────────────
Paste into server/wrangler.toml under [[env.${env}.d1_databases]]:

  database_id = "${db?.uuid ?? db?.id ?? '<see npx wrangler d1 list>'}"

Then continue with docs/DEPLOY.md (Access app → ACCESS_AUD, secrets, migrations, first run).
──────────────────────────────────────────────────────────────────────
`);
