// Deploy one part to one environment. Order for a release: migrate → server → client
// (migrations are always backward-compatible, so the old Worker keeps working until the new one is live).
//
//   node scripts/deploy.mjs migrate --env staging
//   node scripts/deploy.mjs server  --env production
//   node scripts/deploy.mjs client  --env production
import { argValue, envArg, fail, RESOURCES, run, wrangler } from './lib.mjs';

const part = process.argv[2];
const env = envArg();
const version =
  process.env.GITHUB_SHA?.slice(0, 7) ||
  run('git', ['rev-parse', '--short', 'HEAD'], { capture: true, allowFail: true })?.trim() ||
  'local';
const r = RESOURCES[env];

if (part === 'migrate') {
  wrangler(['d1', 'migrations', 'apply', 'DB', '--remote', '--env', env]);
} else if (part === 'server') {
  wrangler(['deploy', '--env', env, '--var', `APP_VERSION:${version}`]);
} else if (part === 'client') {
  run('npm', ['run', 'build', '-w', 'client']);
  run('node', ['scripts/check-bundle.mjs']);
  wrangler([
    'pages',
    'deploy',
    '../client/dist',
    '--project-name',
    r.pages,
    '--branch',
    argValue('--branch') ?? r.pagesBranch,
    '--commit-dirty=true'
  ]);
} else fail('Usage: node scripts/deploy.mjs migrate|server|client --env staging|production');
console.log(`\n✔ ${part} → ${env} (${version})`);
