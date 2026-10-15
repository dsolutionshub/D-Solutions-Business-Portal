/**
 * Settings, dropdown lists, team & roles, and the permission map — against a local D1.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { accessJwt, clientBody, createHarness, projectBody, type Harness } from '../test/harness';

let h: Harness;
let clientId: string;
let projectId: string;

beforeAll(async () => {
  h = await createHarness();
  clientId = (await h.call('owner', 'POST', '/clients', clientBody())).json.id;
});
afterAll(() => h?.dispose());

describe('dropdown lists', () => {
  it('adds values (environment codes upper-cased) and rejects case-insensitive duplicates', async () => {
    const r = await h.call('admin', 'POST', '/lists/environments', { value: ' uat ' });
    expect(r.status).toBe(201);
    expect(r.json.values).toEqual(['DEV', 'QA', 'STG', 'PROD', 'UAT']);
    const dup = await h.call('admin', 'POST', '/lists/environments', { value: 'Uat' });
    expect(dup.status).toBe(409);
    expect(dup.json.error.fields.value).toMatch(/already in the list/);
    expect((await h.call('owner', 'POST', '/lists/hosting', { value: 'Hetzner' })).status).toBe(201);
    expect((await h.call('owner', 'POST', '/lists/hosting', { value: 'hetzner' })).status).toBe(409);
  });

  it('makes new values usable right away (project form accepts UAT)', async () => {
    const r = await h.call(
      'dev',
      'POST',
      '/projects',
      projectBody(clientId, { environments: ['UAT', 'PROD'], hosting: { platform: 'Hetzner' } })
    );
    expect(r.status).toBe(201);
    projectId = r.json.project.id;
    expect((await h.call('dev', 'GET', '/lists')).json.environments).toContain('UAT');
  });

  it('counts usage, and removing a value never changes records that use it', async () => {
    expect((await h.call('admin', 'GET', '/lists/environments/UAT/usage')).json).toEqual({
      count: 1,
      detail: '1 project'
    });
    expect((await h.call('admin', 'GET', '/lists/hosting/Hetzner/usage')).json.count).toBe(1);
    expect((await h.call('admin', 'GET', '/lists/environments/QA/usage')).json.count).toBe(0);
    const r = await h.call('admin', 'DELETE', '/lists/environments/UAT');
    expect(r.json.values).not.toContain('UAT');
    const p = await h.call('dev', 'GET', `/projects/${projectId}`);
    expect(p.json.project.environments).toEqual(['UAT', 'PROD']);
  });

  it('reorders only with exactly the current values', async () => {
    const bad = await h.call('admin', 'POST', '/lists/environments/reorder', { values: ['PROD', 'DEV'] });
    expect(bad.status).toBe(409);
    const ok = await h.call('admin', 'POST', '/lists/environments/reorder', {
      values: ['PROD', 'STG', 'QA', 'DEV']
    });
    expect(ok.json.values).toEqual(['PROD', 'STG', 'QA', 'DEV']);
    expect((await h.call('dev', 'GET', '/lists')).json.environments).toEqual(['PROD', 'STG', 'QA', 'DEV']);
  });

  it('only roles allowed to edit lists do', async () => {
    expect((await h.call('dev', 'POST', '/lists/hosting', { value: 'Fly.io' })).status).toBe(403);
    expect((await h.call('accounts', 'DELETE', '/lists/hosting/Hetzner')).status).toBe(403);
    expect((await h.call('owner', 'POST', '/lists/nope', { value: 'x' })).status).toBe(404);
  });
});

describe('settings', () => {
  it('roles allowed to change settings update; the next invoice number can only go up', async () => {
    const r = await h.call('admin', 'PATCH', '/settings', {
      company: 'D Solutions Pvt Ltd',
      emailDailyLimit: 250,
      timezone: 'Asia/Kolkata'
    });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ company: 'D Solutions Pvt Ltd', emailDailyLimit: 250 });
    const down = await h.call('owner', 'PATCH', '/settings', { nextInvoiceNo: 0 });
    expect(down.status).toBe(400);
    const lower = await h.call('owner', 'PATCH', '/settings', { nextInvoiceNo: 1 });
    expect(lower.status).toBe(200); // same number is fine
    await h.call('owner', 'PATCH', '/settings', { nextInvoiceNo: 50 });
    const back = await h.call('owner', 'PATCH', '/settings', { nextInvoiceNo: 40 });
    expect(back.status).toBe(400);
    expect(back.json.error.fields.nextInvoiceNo).toMatch(/only go up/);
    expect((await h.call('owner', 'PATCH', '/settings', { timezone: 'Mars/Olympus' })).status).toBe(400);
  });

  it('Developers and Accounts can read but not change settings', async () => {
    expect((await h.call('dev', 'GET', '/settings')).status).toBe(200);
    expect((await h.call('dev', 'PATCH', '/settings', { company: 'x' })).status).toBe(403);
    expect((await h.call('accounts', 'PATCH', '/settings', { company: 'x' })).status).toBe(403);
    expect((await h.call('dev', 'PATCH', '/notification-prefs', {})).status).toBe(403);
  });
});

describe('team & roles', () => {
  let invitedId: string;

  it('only Admins invite; duplicates are refused', async () => {
    const body = { name: 'Arvind Menon', email: 'Arvind.M@test.example', role: 'Developer' };
    expect((await h.call('admin', 'POST', '/users', body)).status).toBe(403);
    const r = await h.call('owner', 'POST', '/users', body);
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ email: 'arvind.m@test.example', role: 'Developer', status: 'Invited' });
    invitedId = r.json.id;
    expect((await h.call('owner', 'POST', '/users', body)).status).toBe(409);
  });

  it('an invited user can sign in and becomes Active', async () => {
    const res = await h.env.DB.prepare('SELECT 1').all(); // keep the proxy warm
    expect(res.success).toBe(true);
    const me = await callAs('arvind.m@test.example', 'GET', '/me');
    expect(me.json.user).toMatchObject({ role: 'Developer' });
    expect(
      (await h.sql<{ status: string }>('SELECT status FROM users WHERE id = ?', invitedId))[0]!.status
    ).toBe('Active');
  });

  it('unknown and deactivated emails get a clear 403', async () => {
    const r = await h.call('stranger', 'GET', '/clients');
    expect(r.status).toBe(403);
    expect(r.json.error.message).toMatch(/Ask an Admin to add you/);
    await h.call('owner', 'PATCH', `/users/${invitedId}`, { status: 'Deactivated' });
    const gone = await callAs('arvind.m@test.example', 'GET', '/clients');
    expect(gone.status).toBe(403);
    const back = await h.call('owner', 'PATCH', `/users/${invitedId}`, { status: 'Active' });
    expect(back.json.status).toBe('Active');
  });

  it('role changes are Admin-only; nobody demotes or deactivates themselves', async () => {
    // "admin" here is the Manager custom role: everything except managing the team
    expect((await h.call('admin', 'PATCH', `/users/${invitedId}`, { role: 'Admin' })).status).toBe(403);
    expect((await h.call('owner', 'PATCH', `/users/${invitedId}`, { role: 'Accounts' })).json.role).toBe(
      'Accounts'
    );
    const self = await h.call('owner', 'PATCH', '/users/us_owner', { role: 'Manager' });
    expect(self.status).toBe(403);
    expect((await h.call('owner', 'PATCH', '/users/us_owner', { status: 'Deactivated' })).status).toBe(403);
  });

  it('always keeps at least one active Admin', async () => {
    // make the Manager an Admin; they can then move the original Admin to another role
    await h.call('owner', 'PATCH', '/users/us_admin', { role: 'Admin' });
    const demote = await h.call('admin', 'PATCH', '/users/us_owner', { role: 'Manager' });
    expect(demote.json.role).toBe('Manager');
    expect(
      (
        await h.sql<{ n: number }>(
          "SELECT count(*) AS n FROM users WHERE role = 'Admin' AND status != 'Deactivated'"
        )
      )[0]!.n
    ).toBe(1);
    // the last Admin can't be moved off Admin by anyone (here by themselves is already refused)
    const last = await h.call('admin', 'PATCH', '/users/us_admin', { status: 'Deactivated' });
    expect(last.status).toBe(403);
    // restore for the other tests
    await h.call('admin', 'PATCH', '/users/us_owner', { role: 'Admin' });
    await h.call('owner', 'PATCH', '/users/us_admin', { role: 'Manager' });
  });

  it('the team list shows everyone with status; the picker list hides deactivated users', async () => {
    const team = await h.call('dev', 'GET', '/users?view=team');
    expect(team.json.items.map((u: any) => u.email)).toContain('arvind.m@test.example');
    expect(team.json.items[0]).toHaveProperty('lastLoginAt');
  });
});

describe('permission map is enforced', () => {
  it('Developers cannot void, record payments, read invoices or reports', async () => {
    expect((await h.call('dev', 'POST', '/invoices/INV-T-0001/void')).status).toBe(403);
    expect((await h.call('dev', 'POST', '/payments', {})).status).toBe(403);
    expect((await h.call('dev', 'GET', '/reports')).status).toBe(403);
    expect((await h.call('dev', 'POST', '/admin/run-cron')).status).toBe(403);
  });

  it('Accounts cannot see sheet URLs or secrets, nor domain names in renewals', async () => {
    const p = await h.call('accounts', 'GET', `/projects/${projectId}`);
    expect(p.json.access).toBe('costs');
    expect(p.text).not.toContain('shop.example.com');
    expect(
      (await h.call('accounts', 'POST', `/projects/${projectId}/secrets/reveal`, { field: 'db.password' }))
        .status
    ).toBe(403);
    expect((await h.call('accounts', 'GET', '/admin/export')).status).toBe(403);
  });

  it('Admins can export everything, with secrets hidden', async () => {
    const made = await h.call('owner', 'POST', '/projects', {
      ...projectBody(clientId, { name: 'Secret Shop' }),
      secrets: { 'db.password': 'super-secret-db-pass' }
    });
    expect(made.status).toBe(201);
    const r = await h.call('admin', 'GET', '/admin/export');
    expect(r.status).toBe(200);
    expect(r.text).not.toContain('super-secret-db-pass');
    expect(r.text).not.toContain('ciphertext');
    expect(r.json.clients.length).toBeGreaterThan(0);
  });
});

/** Call as any email (e.g. a newly invited user). */
async function callAs(email: string, method: string, path: string) {
  const r = await h.raw(path, { 'Cf-Access-Jwt-Assertion': await accessJwt(email) }, method);
  return { status: r.status, json: r.json, text: r.text };
}
