import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDb } from '../client';
import { touchLastLogin } from '../../middleware/auth';
import { clientBody, createHarness, type Harness } from '../../test/harness';
import { loadRenewalItems } from './renewals';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(() => h?.dispose());

const blank = (keys: string[]) => Object.fromEntries(keys.map(k => [k, null]));
const project = (clientId: string, name: string) => ({
  project: {
    clientId,
    name,
    type: null,
    status: 'Active',
    startDate: null,
    stack: null,
    environments: ['PROD']
  },
  sheet: {
    links: {
      ...blank(['staging', 'admin', 'api', 'apiStaging', 'repo']),
      prod: 'https://shop.example.com'
    },
    domain: {
      ...blank(['registrar', 'account', 'purchased', 'cost', 'dns', 'sslProvider', 'sslExpiry', 'sslCost']),
      name: `${name.toLowerCase()}.example`,
      expiry: '2026-10-20',
      renewal: 89900,
      auto: 'Off'
    },
    hosting: {
      ...blank(['platform', 'plan', 'region', 'ip', 'account', 'cost', 'cycle']),
      nextBill: '2026-11-01'
    },
    db: blank(['engine', 'host', 'port', 'name', 'user', 'console', 'backup']),
    keys: blank(['googleClientId', 'payGateway', 'payKeyId', 'shipping', 'ga4', 'pixel']),
    notes: null
  },
  costs: [{ name: 'CDN', amountPaise: 100000, cycle: 'Monthly', nextDue: '2026-10-25' }]
});

describe('renewals source (renewals, alerts, cron)', () => {
  it('leaves out every project of an archived client', async () => {
    const keep = (await h.call('owner', 'POST', '/clients', clientBody({ name: 'Keep Co' }))).json.id;
    const gone = (await h.call('owner', 'POST', '/clients', clientBody({ name: 'Gone Co' }))).json.id;
    await h.call('owner', 'POST', '/projects', project(keep, 'Keepshop'));
    await h.call('owner', 'POST', '/projects', project(gone, 'Goneshop'));
    await h.call('owner', 'POST', `/clients/${gone}/archive`);

    const items = await loadRenewalItems(getDb(h.env), '2026-10-12');
    expect([...new Set(items.map(i => i.projectName))]).toEqual(['Keepshop']);
    expect(items.map(i => i.kind)).toEqual(['Domain', 'Hosting', 'Subscription']);
  });
});

describe('last login', () => {
  it('is recorded on /api/me, at most once an hour', async () => {
    const at = async () =>
      (
        await h.sql<{ last_login_at: string | null }>(`SELECT last_login_at FROM users WHERE id = 'us_dev'`)
      )[0]!.last_login_at;
    expect(await at()).toBeNull();
    await h.call('dev', 'GET', '/me');
    const first = await at();
    expect(first).toBeTruthy();
    await h.call('dev', 'GET', '/me'); // within the hour: unchanged
    expect(await at()).toBe(first);
    const later = new Date(Date.parse(first!) + 61 * 60_000);
    await touchLastLogin(getDb(h.env), 'us_dev', later);
    expect(await at()).toBe(later.toISOString());
  });
});
