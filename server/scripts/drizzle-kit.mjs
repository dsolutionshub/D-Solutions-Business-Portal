// Runs drizzle-kit so it can find this workspace's drizzle-orm.
//
// npm keeps drizzle-orm in server/node_modules (its optional react-native peers clash with the
// client's React 18 at the root), while drizzle-kit is hoisted to the root and can't see it.
//   - NODE_PATH covers require() (drizzle-kit loads drizzle.config.ts and the schema that way)
//   - drizzle-orm-hooks.mjs covers import() (drizzle-kit's ORM version check)
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
// drizzle-kit's "exports" hide package.json and bin.cjs, so locate the package from its main entry.
const bin = path.join(path.dirname(require.resolve('drizzle-kit')), 'bin.cjs');
const local = path.resolve(import.meta.dirname, '..', 'node_modules');
const hooks = pathToFileURL(path.join(import.meta.dirname, 'drizzle-orm-hooks.mjs')).href;
const register = `data:text/javascript,import{register}from'node:module';register(${JSON.stringify(hooks)});`;

const result = spawnSync(process.execPath, ['--import', register, bin, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, NODE_PATH: [local, process.env.NODE_PATH].filter(Boolean).join(path.delimiter) }
});
process.exit(result.status ?? 1);
