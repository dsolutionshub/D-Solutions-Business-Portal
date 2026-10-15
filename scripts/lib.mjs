// Small helpers shared by the deployment scripts. Wrangler always runs from server/ so it finds wrangler.toml.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const serverDir = path.join(root, 'server');

export function fail(msg) {
  console.error('\n✘ ' + msg);
  process.exit(1);
}

/** Run a command, streaming output. `capture` returns stdout instead. */
export function run(cmd, args, { cwd = root, capture = false, env = process.env, allowFail = false } = {}) {
  const r = spawnSync(cmd, args, {
    cwd,
    env,
    encoding: 'utf8',
    stdio: capture ? ['inherit', 'pipe', 'pipe'] : 'inherit',
    shell: process.platform === 'win32'
  });
  if (r.status !== 0 && !allowFail)
    fail(`${cmd} ${args.join(' ')} failed${capture ? ':\n' + (r.stderr || r.stdout) : ''}`);
  return capture ? r.stdout : r.status;
}

export const wrangler = (args, opts = {}) => run('npx', ['wrangler', ...args], { cwd: serverDir, ...opts });

/** --env staging|production (required) */
export function envArg(argv = process.argv.slice(2)) {
  const i = argv.indexOf('--env');
  const env = i >= 0 ? argv[i + 1] : null;
  if (env !== 'staging' && env !== 'production') fail('Pass --env staging or --env production.');
  return env;
}

/**
 * Where a database command goes: --env staging|production (remote), or --local for the restore
 * drill on your machine (its own database under server/drill/ — never your dev data).
 */
export function dbTarget(argv = process.argv.slice(2)) {
  if (argv.includes('--local'))
    return { name: 'local drill', flags: ['--local', '--config', 'drill/wrangler.toml'], env: 'local' };
  const env = envArg(argv);
  return { name: env, flags: ['--remote', '--env', env], env };
}

/** Rows from a SELECT on a target database. */
export function d1Query(target, sql) {
  const out = wrangler(['d1', 'execute', 'DB', ...target.flags, '--json', '--command', JSON.stringify(sql)], {
    capture: true
  });
  return JSON.parse(out.slice(out.indexOf('['))).flatMap(p => p.results);
}

export const argValue = (name, argv = process.argv.slice(2)) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

export const RESOURCES = {
  staging: {
    d1: 'dsol-portal-staging',
    r2: 'dsol-portal-files-staging',
    pages: 'dsol-portal-staging',
    pagesBranch: 'staging'
  },
  production: {
    d1: 'dsol-portal-prod',
    r2: 'dsol-portal-files-prod',
    pages: 'dsol-portal',
    pagesBranch: 'main'
  }
};
export const BACKUP_BUCKET = 'dsol-portal-backups';

/** SQL string literal. */
export const sqlStr = s => `'${String(s).replace(/'/g, "''")}'`;
