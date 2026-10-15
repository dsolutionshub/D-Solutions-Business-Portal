/** Custom roles: create, assign, permissions take effect, rename, delete, and who may manage them. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { accessJwt, createHarness, type Harness } from '../test/harness';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(() => h?.dispose());

describe('roles', () => {
  it('lists Admin (built in, every permission) first, then custom roles with their members', async () => {
    const r = await h.call('dev', 'GET', '/roles');
    expect(r.status).toBe(200);
    const names = r.json.items.map((x: any) => x.name);
    expect(names[0]).toBe('Admin');
    expect(names).not.toContain('Owner');
    expect(names).toContain('Developer');
    const admin = r.json.items[0];
    expect(admin).toMatchObject({ id: null, builtin: true, members: 1 });
    expect(admin.permissions).toContain('team.manage');
    expect(admin.permissions).toContain('cron.run');
  });

  it('only Admins create, edit and delete roles; names and permissions are checked', async () => {
    const body = { name: 'Support', permissions: ['clients.read', 'emails.read'] };
    expect((await h.call('admin', 'POST', '/roles', body)).status).toBe(403);
    expect((await h.call('owner', 'POST', '/roles', { ...body, name: 'admin' })).status).toBe(400);
    expect((await h.call('owner', 'POST', '/roles', { ...body, permissions: [] })).status).toBe(400);
    // Admin-only permissions can't be given to a custom role
    expect((await h.call('owner', 'POST', '/roles', { ...body, permissions: ['team.manage'] })).status).toBe(
      400
    );
    expect((await h.call('owner', 'POST', '/roles', { ...body, name: 'developer' })).status).toBe(409);
  });

  it('a person on a new role can do exactly what it allows; edits apply at once', async () => {
    const role = await h.call('owner', 'POST', '/roles', {
      name: 'Support',
      permissions: ['clients.read', 'team.read']
    });
    expect(role.status).toBe(201);
    expect(role.json).toMatchObject({ name: 'Support', builtin: false, members: 0 });

    const invite = await h.call('owner', 'POST', '/users', {
      name: 'Sana Support',
      email: 'sana@test.example',
      role: 'support' // any spelling; stored as the role's name
    });
    expect(invite.status).toBe(201);
    expect(invite.json.role).toBe('Support');
    const as = async (path: string) =>
      h.raw(path, {
        'Cf-Access-Authenticated-User-Email': 'sana@test.example',
        'Cf-Access-Jwt-Assertion': await accessJwt('sana@test.example')
      });

    const me = await as('/me');
    expect(me.json.user.permissions).toEqual(['clients.read', 'team.read']);
    expect((await as('/clients')).status).toBe(200);
    expect((await as('/invoices')).status).toBe(403);

    await h.call('owner', 'PATCH', `/roles/${role.json.id}`, {
      permissions: ['clients.read', 'team.read', 'invoices.read']
    });
    expect((await as('/invoices')).status).toBe(200);
  });

  it('renaming a role keeps its people on it; a role in use can’t be deleted', async () => {
    const support = (await h.call('owner', 'GET', '/roles')).json.items.find(
      (r: any) => r.name === 'Support'
    );
    const renamed = await h.call('owner', 'PATCH', `/roles/${support.id}`, { name: 'Helpdesk' });
    expect(renamed.json).toMatchObject({ name: 'Helpdesk', members: 1 });
    const team = (await h.call('owner', 'GET', '/users?view=team')).json.items;
    expect(team.find((u: any) => u.email === 'sana@test.example').role).toBe('Helpdesk');

    const del = await h.call('owner', 'DELETE', `/roles/${support.id}`);
    expect(del.status).toBe(409);
    expect(del.json.error.message).toMatch(/1 person has this role/);
  });

  it('invites and role changes need a role that exists', async () => {
    const r = await h.call('owner', 'POST', '/users', {
      name: 'Nobody',
      email: 'nobody@test.example',
      role: 'Astronaut'
    });
    expect(r.status).toBe(400);
    expect(r.json.error.fields.role).toMatch(/doesn’t exist/);
  });

  it('someone whose role was removed stays out until an Admin gives them a role', async () => {
    const tmp = await h.call('owner', 'POST', '/roles', { name: 'Temp', permissions: ['clients.read'] });
    const u = await h.call('owner', 'POST', '/users', {
      name: 'Tia',
      email: 'tia@test.example',
      role: 'Temp'
    });
    await h.call('owner', 'PATCH', `/users/${u.json.id}`, { status: 'Deactivated' });
    expect((await h.call('owner', 'DELETE', `/roles/${tmp.json.id}`)).status).toBe(204);

    const back = await h.call('owner', 'PATCH', `/users/${u.json.id}`, { status: 'Active' });
    expect(back.status).toBe(400);
    expect(back.json.error.message).toMatch(/“Temp” no longer exists/);
    const ok = await h.call('owner', 'PATCH', `/users/${u.json.id}`, { status: 'Active', role: 'Admin' });
    expect(ok.status).toBe(200);
    expect(ok.json.role).toBe('Admin');
  });
});
