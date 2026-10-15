/**
 * Custom roles, through the UI as the Admin: create a role with chosen permissions, invite someone
 * with it, and they get exactly those permissions.
 */
import { expect, test } from '@playwright/test';
import { api } from './helpers';

const stamp = Date.now().toString(36);

test('create a role → invite someone with it → they can do only what it allows', async ({ page }) => {
  const roleName = `Support ${stamp}`;
  await page.goto('/team');
  await page.getByRole('tab', { name: 'Role permissions' }).click();
  const roleList = page.getByRole('list', { name: 'Roles' });
  await expect(roleList.getByRole('button', { name: /^Admin/ })).toBeVisible();
  await expect(roleList.getByRole('button', { name: /^Owner/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'New role' }).click();
  const dialog = page.getByRole('dialog', { name: 'New role' });
  await dialog.getByLabel(/^Role name/).fill(roleName);
  await dialog.getByLabel('View invoices', { exact: true }).check();
  await dialog.getByRole('button', { name: 'Create role' }).click();
  await expect(dialog).toBeHidden();
  // the new role is selected: its permissions show beside the list
  await expect(roleList.getByRole('button', { name: new RegExp(roleName) })).toHaveAttribute(
    'aria-current',
    'true'
  );
  const detail = page.getByRole('region', { name: `${roleName} permissions` });
  await expect(
    detail
      .getByRole('listitem')
      .filter({ hasText: /^View invoices$/ })
      .getByLabel('Allowed')
  ).toBeVisible();
  await expect(
    detail
      .getByRole('listitem')
      .filter({ hasText: /^Reveal passwords and secret keys$/ })
      .getByLabel('Not allowed')
  ).toBeVisible();

  await page.getByRole('tab', { name: 'Users' }).click();
  await page.getByRole('button', { name: 'Invite user' }).click();
  const invite = page.getByRole('dialog', { name: 'Invite user' });
  await invite.getByLabel(/^Full name/).fill('Sam Support');
  await invite.getByLabel(/^Work email/).fill(`sam-${stamp}@e2e.example.com`);
  await invite.getByLabel('Role').selectOption(roleName);
  await invite.getByRole('button', { name: 'Send invite' }).click();
  await expect(page.getByRole('cell', { name: `sam-${stamp}@e2e.example.com` })).toBeVisible();

  // their permissions are what the role allows, nothing more
  const me = await api(page.request, 'GET', '/me', undefined, `sam-${stamp}@e2e.example.com`);
  expect(me.user.role).toBe(roleName);
  expect(me.user.permissions).toContain('invoices.read');
  expect(me.user.permissions).not.toContain('secrets.reveal');
});
