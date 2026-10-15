/**
 * Signed out: "/" goes to sign-in, signing in with a password, being sent to sign-in and
 * back, wrong passwords, signing out, and the public pages' layout and accessibility.
 */
import { expect, test } from '@playwright/test';
import { expectAccessible, expectNoHorizontalScroll, OWNER_EMAIL, TEST_PASSWORD } from './helpers';

// no automatic identity here: these tests sign in for real
test.use({ extraHTTPHeaders: {} });

test('"/" → sign in → the portal → sign out', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Work email').fill(OWNER_EMAIL);
  await page.getByLabel(/^Password/).fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // signed in: "/" and the sign-in page lead straight back in
  await page.goto('/');
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto('/clients');
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/clients');
  await expect(page).toHaveURL(/\/login\?next=%2Fclients$/);
});

test('a protected page sends you to sign in, then back to it', async ({ page }) => {
  await page.goto('/invoices?status=Overdue');
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.getByLabel('Work email').fill(OWNER_EMAIL);
  await page.getByLabel(/^Password/).fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/invoices\?status=Overdue$/);
  await expect(page.getByRole('heading', { name: 'Invoices' })).toBeVisible();
});

test('a wrong password shows a clear message and clears the field', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Work email').fill(OWNER_EMAIL);
  await page.getByLabel(/^Password/).fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Email or password is incorrect.');
  await expect(page.getByLabel(/^Password/)).toHaveValue('');
});

test('forgot password always confirms, without saying whether the email exists', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
  await page.getByLabel('Work email').fill('nobody@example.com');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('status')).toContainText('If nobody@example.com has a portal account');
});

for (const theme of ['light', 'dark'] as const)
  test(`public pages at 390px, ${theme}: no sideways scroll, accessible`, async ({ page }) => {
    await page.addInitScript(t => localStorage.setItem('dsol-theme', t), theme);
    await page.setViewportSize({ width: 390, height: 844 });
    for (const p of [
      '/login',
      '/forgot-password',
      '/reset-password?token=abcdefghijklmnopqrstuvwxyz&invite=1'
    ]) {
      await page.goto(p);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.waitForLoadState('networkidle');
      await test.step(p, async () => {
        await expectNoHorizontalScroll(page);
        await expectAccessible(page, `${p} (${theme})`);
      });
    }
  });
