import { defineConfig, devices } from '@playwright/test';
import { readFileSync } from 'node:fs';

/** Tests act as the seeded Owner unless they sign in themselves (development-only header). */
const OWNER =
  /^DEV_USER_EMAIL=(.+)$/m.exec(readFileSync('server/.dev.vars', 'utf8'))?.[1]?.trim().toLowerCase() ?? '';

/**
 * End-to-end tests against local dev servers with their own seeded database (.wrangler/e2e),
 * on their own ports — your normal `npm run dev` data is never touched.
 *   npm run test:e2e
 */
const API_PORT = 8788;
const APP_PORT = 5174;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false, // journeys share one database
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${APP_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    extraHTTPHeaders: { 'Cf-Access-Authenticated-User-Email': OWNER },
    ...devices['Desktop Chrome']
  },
  webServer: [
    {
      command: `npx tsx ../e2e/prepare-db.ts && npx wrangler dev --port ${API_PORT} --ip 127.0.0.1 --persist-to .wrangler/e2e --var ENVIRONMENT:development`,
      cwd: 'server',
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      reuseExistingServer: false, // always a freshly seeded database
      timeout: 180_000
    },
    {
      command: 'npx vite --host 127.0.0.1',
      cwd: 'client',
      env: { VITE_PORT: String(APP_PORT), API_PROXY: `http://127.0.0.1:${API_PORT}` },
      url: `http://127.0.0.1:${APP_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000
    }
  ]
});
