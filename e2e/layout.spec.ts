/**
 * Every page: no sideways scroll at 390px, renders in dark mode, and has no serious
 * accessibility problems (axe) in light and dark.
 */
import { expect, test } from '@playwright/test';
import { api, expectAccessible, expectNoHorizontalScroll, settle } from './helpers';

let pages: string[] = [];

test.beforeAll(async ({ request }) => {
  const client = (await api(request, 'GET', '/clients?pageSize=1')).items[0].id;
  const project = (await api(request, 'GET', '/projects?pageSize=1')).items[0].id;
  const invoice = (await api(request, 'GET', '/invoices?status=Sent&pageSize=1')).items[0].number;
  pages = [
    '/dashboard',
    '/notifications',
    '/notifications?tab=prefs',
    '/reports',
    '/clients',
    '/clients/new',
    `/clients/${client}`,
    '/projects',
    '/projects/new',
    `/projects/${project}`,
    '/releases',
    '/work',
    '/invoices',
    `/invoices/new?client=${client}`,
    `/invoices/${invoice}`,
    '/payments',
    '/email',
    '/email/compose',
    '/email/templates',
    '/team',
    '/team?tab=roles',
    '/settings',
    '/settings?tab=lists'
  ];
});

test('390px: no page scrolls sideways', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const p of pages) {
    await page.goto(p);
    await settle(page);
    await test.step(p, () => expectNoHorizontalScroll(page));
  }
});

for (const theme of ['light', 'dark'] as const)
  test(`${theme} mode: every page renders and passes axe`, async ({ page }) => {
    test.setTimeout(300_000);
    await page.addInitScript(t => localStorage.setItem('dsol-theme', t), theme);
    for (const p of pages) {
      await page.goto(p);
      await settle(page);
      await test.step(p, async () => {
        await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*dark)/);
        await expectAccessible(page, `${p} (${theme})`);
      });
    }
  });
