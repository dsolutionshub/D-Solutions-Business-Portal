/**
 * Fresh database for every end-to-end run: apply the migrations and load the test fixture
 * (server/e2e-fixture: made-up clients, projects, invoices) into server/.wrangler/e2e (separate from the data `npm run dev` uses). Runs as part of the API server's
 * start command (Playwright starts web servers before global setup). Needs server/.dev.vars
 * (ENCRYPTION_KEY, DEV_USER_EMAIL); CI writes one.
 */
import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';

const server = path.resolve(import.meta.dirname, '..', 'server');
const run = (cmd: string) => execSync(cmd, { cwd: server, stdio: 'inherit' });
rmSync(path.join(server, '.wrangler', 'e2e'), { recursive: true, force: true });
run('npx wrangler d1 migrations apply DB --local --persist-to .wrangler/e2e');
run('npx tsx e2e-fixture/demo-seed.ts');
run('npx wrangler d1 execute DB --local --persist-to .wrangler/e2e --file e2e-fixture/.demo.sql');
