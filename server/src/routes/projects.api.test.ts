import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REVEAL_LIMIT_PER_MINUTE } from '../db/repos/projects';
import { clientBody, createHarness, type Harness } from '../test/harness';

const SECRET = 'S3cret-db-pass-🔑';
const PAY_SECRET = 'rzp_live_secret_value';
const EXTRA_SECRET = 'algolia-admin-key-123';

let h: Harness;
let clientId: string;

const blank = (keys: string[]) => Object.fromEntries(keys.map(k => [k, null]));
const projectBody = (
  over: { project?: object; sheet?: object; secrets?: object; extraKeys?: object[]; costs?: object[] } = {}
) => ({
  project: {
    clientId,
    name: 'Kaveri Storefront',
    type: 'E-commerce storefront',
    status: 'Active',
    startDate: '2024-03-12',
    stack: 'Next.js · Medusa · PostgreSQL',
    environments: ['STG', 'PROD'],
    ...over.project
  },
  sheet: {
    links: {
      ...blank(['staging', 'admin', 'api', 'apiStaging', 'repo']),
      prod: 'https://kaverinaturals.in'
    },
    domain: {
      ...blank(['dns', 'sslProvider', 'sslExpiry', 'sslCost', 'account']),
      name: 'kaverinaturals.in',
      registrar: 'GoDaddy',
      purchased: '2021-10-22',
      expiry: '2026-10-22',
      cost: 79900,
      renewal: 89900,
      auto: 'Off'
    },
    hosting: {
      ...blank(['plan', 'region', 'ip', 'account']),
      platform: 'Vercel',
      cost: 504000,
      cycle: 'Monthly',
      nextBill: '2026-11-14'
    },
    db: { ...blank(['host', 'port', 'name', 'user', 'console', 'backup']), engine: 'PostgreSQL' },
    keys: { ...blank(['googleClientId', 'payKeyId', 'shipping', 'ga4', 'pixel']), payGateway: 'Razorpay' },
    notes: 'Freeze deploys in Diwali week.',
    ...over.sheet
  },
  secrets: over.secrets ?? { 'db.password': SECRET, 'keys.paySecret': PAY_SECRET },
  extraKeys: over.extraKeys ?? [
    { label: 'Algolia app ID', isSecret: false, value: 'DEMOALGOLIA' },
    { label: 'Algolia admin key', isSecret: true, value: EXTRA_SECRET }
  ],
  costs: over.costs ?? [
    { name: 'Cloudflare Pro', amountPaise: 170000, cycle: 'Monthly', nextDue: '2026-10-28' },
    { name: 'kaveri.shop', amountPaise: 195000, cycle: 'Yearly', nextDue: null }
  ]
});

beforeAll(async () => {
  h = await createHarness();
  clientId = (await h.call('owner', 'POST', '/clients', clientBody())).json.id;
});
afterAll(() => h?.dispose());

describe('projects', () => {
  let id: string;
  let view: any;

  it('creates project + sheet + secrets + other keys + costs together', async () => {
    const r = await h.call('dev', 'POST', '/projects', projectBody());
    expect(r.status).toBe(201);
    view = r.json;
    id = view.project.id;
    expect(view.sheet.domain).toMatchObject({ name: 'kaverinaturals.in', cost: 79900, auto: 'Off' });
    expect(view.secrets['db.password']).toMatchObject({ set: true });
    expect(view.secrets['keys.paySecret'].set).toBe(true);
    expect(view.secrets['hosting.password'].set).toBe(false);
    expect(view.extraKeys).toMatchObject([
      { label: 'Algolia app ID', isSecret: false, value: 'DEMOALGOLIA' },
      { label: 'Algolia admin key', isSecret: true, value: null, hasValue: true }
    ]);
    expect(view.costs).toHaveLength(2);
    // 899 domain + 5,040 × 12 hosting + 1,700 × 12 + 1,950
    expect(view.annualCostPaise).toBe(89900 + 6048000 + 2040000 + 195000);
  });

  it('never returns secret values from GET, and stores only ciphertext', async () => {
    const r = await h.call('owner', 'GET', `/projects/${id}`);
    for (const s of [SECRET, PAY_SECRET, EXTRA_SECRET]) expect(r.text).not.toContain(s);
    const rows = await h.sql<{ ciphertext: string }>(
      `SELECT ciphertext FROM project_secrets WHERE project_id = ?`,
      id
    );
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.ciphertext).not.toContain('S3cret');
    const [extra] = await h.sql<{ value_plain: string | null }>(
      `SELECT value_plain FROM extra_keys WHERE is_secret = 1`
    );
    expect(extra!.value_plain).toBeNull();
  });

  it('rejects invalid input with field errors (prototype rules)', async () => {
    const r = await h.call(
      'owner',
      'POST',
      '/projects',
      projectBody({
        project: { name: 'ab', environments: [] },
        sheet: { links: { ...projectBody().sheet.links, prod: 'kaverinaturals.in' } },
        costs: [{ name: 'Bad', amountPaise: -5, cycle: 'Monthly', nextDue: '2026-02-30' }]
      })
    );
    expect(r.status).toBe(400);
    expect(r.json.error.fields).toMatchObject({
      'project.name': 'Enter a project name (min. 3 characters).',
      'project.environments': 'Select at least one environment.',
      'sheet.links.prod': 'URL must start with http:// or https://',
      'costs.0.amountPaise': 'Amount cannot be negative.',
      'costs.0.nextDue': 'Enter a valid date (YYYY-MM-DD).'
    });
  });

  it('lists projects with client, domain and hosting — Accounts get costs and dates only', async () => {
    const r = await h.call('owner', 'GET', `/projects?client=${clientId}`);
    expect(r.json.items[0]).toMatchObject({
      name: 'Kaveri Storefront',
      clientName: 'Kaveri Naturals',
      domainExpiry: '2026-10-22',
      hostingPlatform: 'Vercel',
      dbEngine: 'PostgreSQL',
      prodUrl: 'https://kaverinaturals.in'
    });
    const acc = await h.call('accounts', 'GET', '/projects');
    expect(acc.json.items[0]).toMatchObject({
      name: 'Kaveri Storefront',
      hostingPlatform: 'Vercel',
      hostingCostPaise: 504000,
      domainExpiry: '2026-10-22',
      prodUrl: null,
      domainName: null,
      dbEngine: null
    });
  });

  it('gives Accounts a cost-only project view, redacted on the server', async () => {
    const r = await h.call('accounts', 'GET', `/projects/${id}`);
    expect(r.status).toBe(200);
    expect(r.json.access).toBe('costs');
    expect(r.json.sheet.domain).toMatchObject({
      expiry: '2026-10-22',
      cost: 79900,
      renewal: 89900,
      name: null,
      registrar: null,
      account: null
    });
    expect(r.json.sheet.hosting).toMatchObject({
      platform: 'Vercel',
      cost: 504000,
      cycle: 'Monthly',
      nextBill: '2026-11-14',
      account: null,
      ip: null
    });
    expect(r.json.sheet.links.prod).toBe('');
    expect(r.json.sheet.db.engine).toBeNull();
    expect(r.json.sheet.keys.payGateway).toBeNull();
    expect(r.json.sheet.notes).toBeNull();
    expect(r.json.extraKeys).toEqual([]);
    expect(Object.values(r.json.secrets).every((s: any) => s.set === false)).toBe(true);
    expect(r.json.costs).toHaveLength(2);
    expect(r.text).not.toMatch(/kaverinaturals\.in|PostgreSQL|Razorpay|DEMOALGOLIA|Diwali/);
    expect((await h.call('owner', 'GET', `/projects/${id}`)).json.access).toBe('full');
    expect((await h.call('accounts', 'GET', `/projects/${id}/sheet.txt`)).status).toBe(403);
  });

  describe('reveal', () => {
    it('returns the value to an Admin and writes the audit log', async () => {
      const r = await h.call('owner', 'POST', `/projects/${id}/secrets/reveal`, { field: 'db.password' });
      expect(r.status).toBe(200);
      expect(r.json).toEqual({ value: SECRET });
      expect(r.headers.get('Cache-Control')).toBe('no-store');
      const audit = await h.sql(
        `SELECT user_id, action, entity_id, meta FROM audit_log WHERE action = 'secret.reveal'`
      );
      expect(audit).toEqual([
        {
          user_id: 'us_owner',
          action: 'secret.reveal',
          entity_id: id,
          meta: JSON.stringify({ field: 'db.password', label: 'db.password' })
        }
      ]);
    });

    it('reveals a secret "other key"', async () => {
      const key = view.extraKeys.find((k: { isSecret: boolean }) => k.isSecret);
      const r = await h.call('admin', 'POST', `/projects/${id}/secrets/reveal`, { field: `extra:${key.id}` });
      expect(r.json.value).toBe(EXTRA_SECRET);
    });

    it('is blocked for Developers and Accounts', async () => {
      expect(
        (await h.call('dev', 'POST', `/projects/${id}/secrets/reveal`, { field: 'db.password' })).status
      ).toBe(403);
      expect(
        (await h.call('accounts', 'POST', `/projects/${id}/secrets/reveal`, { field: 'db.password' })).status
      ).toBe(403);
    });

    it('404s for a secret that is not set, 400 for an unknown field', async () => {
      expect(
        (await h.call('owner', 'POST', `/projects/${id}/secrets/reveal`, { field: 'hosting.password' }))
          .status
      ).toBe(404);
      expect(
        (await h.call('owner', 'POST', `/projects/${id}/secrets/reveal`, { field: 'links.prod' })).status
      ).toBe(400);
    });

    it(`is rate-limited to ${REVEAL_LIMIT_PER_MINUTE} per minute per user`, async () => {
      const now = new Date().toISOString();
      for (let i = 0; i < REVEAL_LIMIT_PER_MINUTE; i++)
        await h.sql(
          `INSERT INTO audit_log (id, user_id, action, entity, entity_id, created_at) VALUES (?, 'us_admin', 'secret.reveal', 'project', ?, ?)`,
          `au_rl_${i}`,
          id,
          now
        );
      expect(
        (await h.call('admin', 'POST', `/projects/${id}/secrets/reveal`, { field: 'db.password' })).status
      ).toBe(429);
      expect(
        (await h.call('owner', 'POST', `/projects/${id}/secrets/reveal`, { field: 'db.password' })).status
      ).toBe(200);
    });
  });

  describe('edit', () => {
    it('keeps secrets that are omitted (edit without losing secrets)', async () => {
      const keys = view.extraKeys.map(
        (k: { id: string; label: string; isSecret: boolean; value: string | null }) =>
          k.isSecret
            ? { id: k.id, label: k.label, isSecret: true }
            : { id: k.id, label: k.label, isSecret: false, value: k.value }
      );
      const r = await h.call(
        'owner',
        'PATCH',
        `/projects/${id}`,
        projectBody({ project: { name: 'Kaveri Storefront v2' }, secrets: {}, extraKeys: keys, costs: [] })
      );
      expect(r.status).toBe(200);
      expect(r.json.project.name).toBe('Kaveri Storefront v2');
      expect(r.json.secrets['db.password'].set).toBe(true);
      expect(r.json.costs).toEqual([]);
      expect(
        (await h.call('owner', 'POST', `/projects/${id}/secrets/reveal`, { field: 'db.password' })).json.value
      ).toBe(SECRET);
      const extra = r.json.extraKeys.find((k: { isSecret: boolean }) => k.isSecret);
      expect(
        (await h.call('owner', 'POST', `/projects/${id}/secrets/reveal`, { field: `extra:${extra.id}` })).json
          .value
      ).toBe(EXTRA_SECRET);
      view = r.json;
    });

    it('replaces a secret with a new value and clears one with ""', async () => {
      const r = await h.call(
        'owner',
        'PATCH',
        `/projects/${id}`,
        projectBody({ secrets: { 'db.password': 'new-pass', 'keys.paySecret': '' }, extraKeys: [] })
      );
      expect(r.json.secrets['keys.paySecret'].set).toBe(false);
      expect(
        (await h.call('owner', 'POST', `/projects/${id}/secrets/reveal`, { field: 'db.password' })).json.value
      ).toBe('new-pass');
      expect(await h.sql(`SELECT * FROM extra_keys WHERE project_id = ?`, id)).toHaveLength(0);
    });

    it('needs the value retyped to turn a secret key into a plain one', async () => {
      const created = await h.call(
        'owner',
        'PATCH',
        `/projects/${id}`,
        projectBody({ secrets: {}, extraKeys: [{ label: 'Token', isSecret: true, value: 'abc' }] })
      );
      const k = created.json.extraKeys[0];
      const r = await h.call(
        'owner',
        'PATCH',
        `/projects/${id}`,
        projectBody({ secrets: {}, extraKeys: [{ id: k.id, label: 'Token', isSecret: false }] })
      );
      expect(r.status).toBe(400);
      expect(r.json.error.fields).toEqual({
        'extraKeys.0.value': 'Type the value again to store it as a plain key.'
      });
    });

    it('lets Accounts neither create nor edit', async () => {
      expect((await h.call('accounts', 'PATCH', `/projects/${id}`, projectBody())).status).toBe(403);
    });
  });

  it('exports the sheet as text with secrets hidden', async () => {
    const r = await h.call('dev', 'GET', `/projects/${id}/sheet.txt`);
    expect(r.status).toBe(200);
    expect(r.text).toContain('Domain expiry date: 22 Oct 2026');
    expect(r.text).toContain('Password / access key: [hidden]');
    expect(r.text).not.toContain('new-pass');
  });

  describe('archived client', () => {
    it("can't get new projects", async () => {
      await h.call('owner', 'POST', `/clients/${clientId}/archive`);
      const create = await h.call(
        'owner',
        'POST',
        '/projects',
        projectBody({ project: { name: 'Another project' } })
      );
      expect(create.status).toBe(400);
      expect(create.json.error.fields).toEqual({
        'project.clientId': 'That client is archived — restore it first.'
      });
    });
  });
});

describe('lists', () => {
  it('returns every dropdown list grouped by key', async () => {
    await h.sql(
      `INSERT INTO lists (id, list_key, value, sort_order) VALUES ('lv1', 'hosting', 'Vercel', 1), ('lv2', 'hosting', 'AWS', 0)`
    );
    const r = await h.call('dev', 'GET', '/lists');
    expect(r.json.hosting).toEqual(['AWS', 'Vercel']);
    expect(r.json.environments).toEqual(['DEV', 'QA', 'STG', 'PROD']);
    expect(r.json.industry).toEqual([]);
  });
});
