// Create the Cloudflare D1 database an environment needs, if it doesn't exist yet, and print what to
// paste into server/wrangler.toml. Safe to run again.
//
//   npm run setup:staging      (= node scripts/setup-cloudflare.mjs --env staging)
//   npm run setup:prod         (= node scripts/setup-cloudflare.mjs --env production)
//
// Needs `npx wrangler login` first (or CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID).
import { envArg, RESOURCES, wrangler } from './lib.mjs';

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

// (no R2: client logos are stored in D1; backups are kept as GitHub artifacts)
// (the app is hosted on Netlify, so no Cloudflare Pages project is created)

console.log(`
──────────────────────────────────────────────────────────────────────
Paste into server/wrangler.toml under [[env.${env}.d1_databases]]:

  database_id = "${db?.uuid ?? db?.id ?? '<see npx wrangler d1 list>'}"

Then continue with docs/DEPLOY.md (secrets, deploy, first run).
──────────────────────────────────────────────────────────────────────
`);
