/**
 * The main journeys, through the UI, as the Admin (DEV_USER_EMAIL) unless noted.
 * They run in order and share the client / project created in the first one.
 */
import { expect, test, type Page } from '@playwright/test';
import { actAs, api, OWNER_EMAIL, userWithRole } from './helpers';

test.describe.configure({ mode: 'serial' });

const stamp = Date.now().toString(36);
const SECRET = `e2e-db-password-${stamp}`;
const DOMAIN = `e2e-${stamp}.example`;
const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const addDays = (iso: string, n: number) =>
  new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);

/** A form field by its exact label (required fields show a trailing *). */
const field = (name: string) => new RegExp('^' + name + '\\*?$');

/** The add / edit forms are accordions: open a closed section by its title. */
const openSection = (page: Page, title: string) =>
  page.getByRole('button', { name: new RegExp('^' + title) }).click(); // titles hold no regex characters

let clientId = '';
let projectId = '';
let paidInvoice = '';

const workStatus = async (page: Page, title: string) =>
  (
    (await api(page.request, 'GET', `/work?status=all&client=${clientId}&pageSize=100`)).items as {
      title: string;
      status: string;
    }[]
  ).find(w => w.title === title)?.status;

test('1. add client → project with secrets → Admin reveals; a Developer cannot', async ({ page }) => {
  await page.goto('/clients/new');
  await page.getByLabel('Client name').fill(`E2E Naturals ${stamp}`);
  await openSection(page, 'Contact information');
  await page.getByLabel('Primary contact').fill('Asha Rao');
  await page.getByLabel(field('Email')).fill('asha@e2e.example.com');
  await page.getByLabel(field('Phone')).fill('+91 98450 12345');
  await openSection(page, 'Address');
  await page.getByLabel('Address line 1').fill('1 MG Road');
  await page.getByLabel('City').fill('Bengaluru');
  await page.getByLabel('PIN code').fill('560001');
  await page.getByRole('button', { name: 'Save client' }).click();
  await expect(page).toHaveURL(/\/clients\/cl_[^/?]+/);
  clientId = /\/clients\/(cl_[^/?#]+)/.exec(page.url())![1]!;

  await page.goto('/projects/new');
  await page.getByLabel('Project name').fill(`E2E Store ${stamp}`);
  await page.getByLabel(field('Client')).selectOption(clientId);
  await page.getByRole('checkbox', { name: /PROD/ }).check();
  await openSection(page, 'Website & API URLs');
  await page.getByLabel('Production URL').fill('https://shop.e2e.example.com');
  await openSection(page, 'Domain & SSL');
  await page.getByLabel('Domain name').fill(DOMAIN);
  await page.getByLabel('Domain expiry date').fill(addDays(today, 5));
  await openSection(page, 'Database');
  await page.getByRole('textbox', { name: 'Password / access key' }).fill(SECRET);
  await page.getByRole('button', { name: 'Save project' }).click();
  await expect(page).toHaveURL(/\/projects\/pj_[^/?]+/);
  projectId = /\/projects\/(pj_[^/?#]+)/.exec(page.url())![1]!;

  await page.getByRole('button', { name: 'Show Password / access key' }).click();
  await expect(page.getByText(SECRET)).toBeVisible();

  const dev = await userWithRole(page.request, 'Developer');
  await actAs(page, dev);
  await page.reload();
  await expect(page.getByRole('heading', { name: `E2E Store ${stamp}` })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show Password / access key' })).toHaveCount(0);
  await expect(page.getByLabel('Your role can’t reveal secrets').first()).toBeVisible();
  const refused = await page.request.post(`/api/projects/${projectId}/secrets/reveal`, {
    data: { field: 'db.password' },
    headers: { 'Cf-Access-Authenticated-User-Email': dev }
  });
  expect(refused.status()).toBe(403);
  await actAs(page, null);
});

test('2. release → billing → invoice from work → issue → partial and full payment → work Paid', async ({
  page
}) => {
  await page.goto('/releases');
  await page.getByRole('button', { name: 'Add release' }).first().click();
  const drawer = page.getByRole('dialog');
  await drawer.getByLabel(field('Client')).selectOption(clientId);
  await drawer.getByLabel(field('Project')).selectOption(projectId);
  await drawer.getByLabel('Release version').fill('v9.1.0');
  await drawer.getByRole('textbox', { name: 'Features' }).fill(`Wishlist ${stamp}\nGift cards ${stamp}`);
  await drawer.getByRole('button', { name: 'Add release' }).click();

  // "Add to billing" opens next: price both features
  const billing = page.getByRole('dialog', { name: /billing/i });
  await billing.getByLabel(`Amount for Wishlist ${stamp}`).fill('25000');
  await billing.getByLabel(`Amount for Gift cards ${stamp}`).fill('15000');
  await billing.getByRole('button', { name: 'Add to billing' }).click();
  await expect(billing).toBeHidden();
  expect(await workStatus(page, `Wishlist ${stamp}`)).toBe('To bill');

  await page.goto(`/work?client=${clientId}&status=To bill`);
  await page.getByLabel(`Select Wishlist ${stamp}`).check();
  await page.getByLabel(`Select Gift cards ${stamp}`).check();
  await page.getByRole('button', { name: 'Create invoice' }).click();
  await expect(page.getByRole('heading', { name: 'Create invoice' })).toBeVisible();
  await page.getByRole('button', { name: 'Issue invoice', exact: true }).click();
  await expect(page).toHaveURL(/\/invoices\/(?!new)[^/?]+$/);
  paidInvoice = decodeURIComponent(page.url().split('/invoices/')[1]!);
  expect(await workStatus(page, `Wishlist ${stamp}`)).toBe('Invoiced');

  // ₹40,000, no GST: pay ₹20,000, then the rest
  await page.getByRole('button', { name: 'Record payment' }).click();
  let dialog = page.getByRole('dialog', { name: 'Record payment' });
  await dialog.getByLabel('Amount (₹)').fill('20000');
  await dialog.getByLabel('Transaction reference').fill(`UTR${stamp}A`);
  await dialog.getByRole('button', { name: 'Record payment' }).click();
  await expect(page.getByText(/₹20,000 still due/)).toBeVisible();
  await page.keyboard.press('Escape'); // the receipt
  expect(await workStatus(page, `Wishlist ${stamp}`)).toBe('Part paid');

  await page.getByRole('button', { name: 'Record payment' }).click();
  dialog = page.getByRole('dialog', { name: 'Record payment' });
  await expect(dialog.getByLabel('Amount (₹)')).toHaveValue('20000');
  await dialog.getByLabel('Transaction reference').fill(`UTR${stamp}B`);
  await dialog.getByRole('button', { name: 'Record payment' }).click();
  await expect(page.getByText(/invoice settled · 2 work items now Paid/)).toBeVisible();
  await page.keyboard.press('Escape');
  expect(await workStatus(page, `Wishlist ${stamp}`)).toBe('Paid');
  expect(await workStatus(page, `Gift cards ${stamp}`)).toBe('Paid');
});

test('3. void an unpaid invoice → work back to To bill; duplicating doesn’t re-bill', async ({ page }) => {
  // one more delivered item to bill
  await api(page.request, 'POST', '/work', {
    projectId,
    title: `Size guide ${stamp}`,
    type: 'Feature',
    deliveredOn: today,
    billing: 'Fixed',
    amountPaise: 1_000_000,
    hours: 0,
    ratePaise: 0,
    releaseId: null,
    note: null
  });
  await page.goto(`/work?client=${clientId}&status=To bill`);
  await page.getByLabel(`Select Size guide ${stamp}`).check();
  await page.getByRole('button', { name: 'Create invoice' }).click();
  await page.getByRole('button', { name: 'Issue invoice', exact: true }).click();
  await expect(page).toHaveURL(/\/invoices\/(?!new)[^/?]+$/);
  expect(await workStatus(page, `Size guide ${stamp}`)).toBe('Invoiced');

  await page.getByRole('button', { name: 'Void' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Void invoice' }).click();
  await expect(page.getByText(/voided · 1 work item\(s\) back to To bill/)).toBeVisible();
  expect(await workStatus(page, `Size guide ${stamp}`)).toBe('To bill');

  // duplicate the paid invoice: a new draft without work links
  await page.goto(`/invoices/${encodeURIComponent(paidInvoice)}`);
  await page.getByRole('button', { name: 'Duplicate' }).click();
  await expect(page.getByText(/delivered work isn’t billed again/)).toBeVisible();
  await expect(page).not.toHaveURL(new RegExp(`/invoices/${paidInvoice}$`));
  const dup = decodeURIComponent(page.url().split('/invoices/')[1]!);
  const detail = await api(page.request, 'GET', `/invoices/${encodeURIComponent(dup)}`);
  expect(detail.status).toBe('Draft');
  expect(detail.lines.every((l: { workItemId: string | null }) => !l.workItemId)).toBe(true);
  expect(await workStatus(page, `Wishlist ${stamp}`)).toBe('Paid');
});

test('4. domain due in 5 days → alert → new expiry date → alert gone', async ({ page }) => {
  const title = `${DOMAIN} expires in 5 days`;
  await page.goto('/notifications');
  await expect(page.getByText(title)).toBeVisible();
  // the bell shows the unread count and the five most urgent alerts (the seed has more urgent ones)
  const bell = page.getByRole('button', { name: /^Notifications, \d+ unread$/ });
  const unread = Number(/(\d+)/.exec((await bell.getAttribute('aria-label'))!)![1]);
  expect(unread).toBeGreaterThan(0);
  await bell.click();
  await expect(page.getByRole('menu').getByRole('menuitem')).toHaveCount(5 + 1); // 5 alerts + "View all"
  await page.keyboard.press('Escape');

  // renewing = moving the expiry date forward on the project
  await page.goto(`/projects/${projectId}/edit`);
  await openSection(page, 'Domain & SSL');
  await page.getByLabel('Domain expiry date').fill(addDays(today, 370));
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}$`));

  await page.goto('/notifications');
  await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
  await expect(page.getByText(title)).toHaveCount(0);
});

test('5. add "UAT" and "Hetzner" in Settings → offered in the project form', async ({ page }) => {
  await page.goto('/settings?tab=lists');
  await openSection(page, 'Environments');
  await openSection(page, 'Hosting platforms');
  await page.getByLabel('Add to Environments').fill('uat');
  await page.getByLabel('Add to Environments').press('Enter');
  await expect(page.getByText('UAT added')).toBeVisible();
  await page.getByLabel('Add to Hosting platforms').fill('Hetzner');
  await page.getByLabel('Add to Hosting platforms').press('Enter');
  await expect(page.getByText('Hetzner added')).toBeVisible();

  await page.goto('/projects/new');
  await expect(page.getByRole('checkbox', { name: /UAT/ })).toBeVisible();
  await expect(page.getByLabel('Hosting platform').locator('option', { hasText: 'Hetzner' })).toHaveCount(1);
  expect(OWNER_EMAIL).toBeTruthy();
});
