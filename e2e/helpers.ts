import AxeBuilder from '@axe-core/playwright';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/** The Admin: DEV_USER_EMAIL from server/.dev.vars (the seed makes it the Admin). */
export const OWNER_EMAIL = (() => {
  const vars = readFileSync(path.resolve(import.meta.dirname, '..', 'server', '.dev.vars'), 'utf8');
  return /^DEV_USER_EMAIL=(.+)$/m.exec(vars)![1]!.trim().toLowerCase();
})();

/** Password of every active user in the test fixture (server/e2e-fixture/demo-seed.ts). */
export const TEST_PASSWORD = 'E2e-Fixture-Pass-2026';

/** Act as another user: in development the API honours the Access email header (never in production). */
export async function actAs(page: Page, email: string | null) {
  await page.setExtraHTTPHeaders(email ? { 'Cf-Access-Authenticated-User-Email': email } : {});
}

/** JSON API call as `email` (default: the Admin). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper: callers read whatever fields they check
export async function api<T = any>(
  request: APIRequestContext,
  method: string,
  url: string,
  data?: unknown,
  email = OWNER_EMAIL
): Promise<T> {
  const res = await request.fetch('/api' + url, {
    method,
    data,
    headers: { 'Cf-Access-Authenticated-User-Email': email }
  });
  const body = await res.text();
  if (!res.ok()) throw new Error(`${method} ${url} → ${res.status()} ${body}`);
  return body ? JSON.parse(body) : (undefined as T);
}

/** The first active user with this role (from the seed). */
export async function userWithRole(request: APIRequestContext, role: string): Promise<string> {
  const team = await api<{ items: { email: string; role: string; status: string }[] }>(
    request,
    'GET',
    '/users?view=team'
  );
  return team.items.find(u => u.role === role && u.status === 'Active')!.email;
}

/** Wait until the page has rendered its main heading and finished loading data. */
export async function settle(page: Page) {
  await expect(page.locator('main h1').first()).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
}

export async function expectNoHorizontalScroll(page: Page) {
  const { scroll, client } = await page.evaluate(() => {
    window.scrollTo(10_000, window.scrollY);
    return { scroll: window.scrollX, client: document.documentElement.clientWidth };
  });
  expect(scroll, `page scrolls sideways at ${client}px`).toBe(0);
}

/** No serious or critical accessibility violations (axe, WCAG 2.1 A/AA rules). */
export async function expectAccessible(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const bad = results.violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
  const report = bad
    .map(
      v =>
        `${v.id} (${v.impact}): ${v.help}\n   ${v.nodes
          .slice(0, 3)
          .map(n => n.target.join(' '))
          .join('\n   ')}`
    )
    .join('\n');
  expect(bad, `${label}\n${report}`).toEqual([]);
}
