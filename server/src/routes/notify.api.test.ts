/**
 * Alerts (bell + inbox), renewals, notices and the daily cron, against a local D1 with Brevo mocked.
 */
import { addDays, addMonths, todayIso } from '@dsol/shared';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { clientBody, createHarness, mockBrevo, projectBody, type Harness } from '../test/harness';

let h: Harness;
let clientId: string;
let projectId: string;
const today = todayIso();
const in5 = addDays(today, 5);
let brevo: ReturnType<typeof mockBrevo> | null = null;
afterEach(() => {
  brevo?.restore();
  brevo = null;
});

const alertIds = async (as: 'owner' | 'dev' | 'accounts', q = '') =>
  ((await h.call(as, 'GET', '/alerts' + q)).json.items as any[]).map(a => a.id);
const enc = encodeURIComponent;

beforeAll(async () => {
  h = await createHarness();
  clientId = (await h.call('owner', 'POST', '/clients', clientBody())).json.id;
  const r = await h.call(
    'owner',
    'POST',
    '/projects',
    projectBody(clientId, {
      domain: {
        name: 'kaveri.example',
        registrar: 'GoDaddy',
        expiry: in5,
        renewal: 89_900,
        sslProvider: 'Sectigo',
        sslExpiry: in5,
        sslCost: 890_000
      },
      hosting: {
        platform: 'Vercel',
        plan: 'Pro',
        cost: 168_000,
        cycle: 'Monthly',
        nextBill: addDays(today, 60)
      }
    })
  );
  projectId = r.json.project.id;
});
afterAll(() => h?.dispose());

describe('alerts', () => {
  it('a domain expiring in 5 days shows in the bell and inbox', async () => {
    const r = await h.call('owner', 'GET', '/alerts');
    const domain = r.json.items.find((a: any) => a.type === 'Domain expiration');
    expect(domain).toMatchObject({
      id: `r:${projectId}:domain:${in5}`,
      title: 'kaveri.example expires in 5 days',
      tone: 'bad',
      read: false
    });
    expect(r.json.unread).toBe(r.json.items.length);
    // hosting is 60 days out: outside its 14-day window
    expect(r.json.items.some((a: any) => a.type === 'Hosting renewals')).toBe(false);
  });

  it('Accounts see the cost alert without the domain name', async () => {
    const items = (await h.call('accounts', 'GET', '/alerts')).json.items as any[];
    expect(items.find(a => a.type === 'Domain expiration').title).toBe(
      'Domain · Kaveri Storefront expires in 5 days'
    );
  });

  it('marks read / unread, dismisses, restores and marks all read — per user', async () => {
    const id = enc(`r:${projectId}:domain:${in5}`);
    await h.call('owner', 'POST', `/alerts/${id}/read`);
    expect(
      (await h.call('owner', 'GET', '/alerts?state=unread')).json.items.some(
        (a: any) => a.type === 'Domain expiration'
      )
    ).toBe(false);
    // the Admin still sees it unread
    expect(
      (await h.call('admin', 'GET', '/alerts?state=unread')).json.items.some(
        (a: any) => a.type === 'Domain expiration'
      )
    ).toBe(true);
    await h.call('owner', 'POST', `/alerts/${id}/unread`);
    expect(
      (await h.call('owner', 'GET', '/alerts?state=unread')).json.items.some(
        (a: any) => a.type === 'Domain expiration'
      )
    ).toBe(true);

    await h.call('owner', 'POST', `/alerts/${id}/dismiss`);
    const after = await h.call('owner', 'GET', '/alerts');
    expect(after.json.items.some((a: any) => a.type === 'Domain expiration')).toBe(false);
    expect(after.json.dismissedCount).toBe(1);
    expect(
      (await h.call('owner', 'GET', '/alerts?dismissed=1')).json.items.find(
        (a: any) => a.type === 'Domain expiration'
      ).dismissed
    ).toBe(true);
    expect((await h.call('owner', 'POST', '/alerts/restore-dismissed')).json.restored).toBe(1);

    await h.call('owner', 'POST', '/alerts/read-all');
    expect((await h.call('owner', 'GET', '/alerts')).json.unread).toBe(0);
  });

  it('turning a type off hides it; turning in-app off hides it from the inbox only', async () => {
    await h.call('admin', 'PATCH', '/notification-prefs', {
      'SSL expiration': { days: [], email: true, inApp: true }
    });
    expect((await alertIds('owner')).some(id => id.includes(':ssl:'))).toBe(false);
    await h.call('admin', 'PATCH', '/notification-prefs', {
      'SSL expiration': { days: [30, 14, 7], email: true, inApp: false }
    });
    expect((await alertIds('owner')).some(id => id.includes(':ssl:'))).toBe(false);
    await h.call('admin', 'PATCH', '/notification-prefs', {
      'SSL expiration': { days: [30, 14, 7], email: true, inApp: true }
    });
    expect((await alertIds('owner')).some(id => id.includes(':ssl:'))).toBe(true);
  });

  it('only accepts the offered reminder days', async () => {
    const r = await h.call('admin', 'PATCH', '/notification-prefs', {
      'Domain expiration': { days: [5], email: true, inApp: true }
    });
    expect(r.status).toBe(400);
  });

  it('manual notices appear inside their window and can be removed', async () => {
    const n = await h.call('dev', 'POST', '/notices', {
      title: 'Maintenance on Kaveri',
      body: '1–2 AM IST',
      date: addDays(today, 1),
      type: 'Upcoming maintenance'
    });
    expect(n.status).toBe(201);
    expect(await alertIds('dev')).toContain(`n:${n.json.id}:${addDays(today, 1)}`);
    expect(
      (await h.call('accounts', 'POST', '/notices', { title: 'x', body: null, date: today, type: 'Other' }))
        .status
    ).toBe(403);
    await h.call('dev', 'DELETE', `/notices/${n.json.id}`);
    expect((await alertIds('dev')).some(id => id.startsWith('n:'))).toBe(false);
  });
});

describe('renewals', () => {
  it('renew moves the sheet date forward, logs history, and the old alert is gone', async () => {
    const r = await h.call('owner', 'POST', `/renewals/${projectId}/domain/renew`, {
      periods: 1,
      paidVia: 'Company card',
      reference: 'GD-88213490',
      amountPaise: 89_900
    });
    expect(r.status).toBe(200);
    expect(r.json.item.expiry).toBe(addMonths(in5, 12));
    expect(r.json.history).toMatchObject({
      itemName: 'kaveri.example',
      period: '1 year',
      renewedBy: 'Admin User',
      reference: 'GD-88213490',
      paidVia: 'Company card',
      amountPaise: 89_900
    });
    const sheet = await h.call('owner', 'GET', `/projects/${projectId}`);
    expect(sheet.json.sheet.domain.expiry).toBe(addMonths(in5, 12));
    expect(await alertIds('owner')).not.toContain(`r:${projectId}:domain:${in5}`);
    const renewals = await h.call('owner', 'GET', `/projects/${projectId}/renewals`);
    expect(renewals.json.history).toHaveLength(1);
  });

  it('needs an order / receipt number, and an existing item', async () => {
    const bad = await h.call('owner', 'POST', `/renewals/${projectId}/ssl/renew`, {
      periods: 1,
      paidVia: null,
      reference: 'ab',
      amountPaise: 0
    });
    expect(bad.status).toBe(400);
    expect(
      (
        await h.call('owner', 'POST', `/renewals/${projectId}/cost:nope/renew`, {
          periods: 1,
          paidVia: null,
          reference: 'ABCD',
          amountPaise: 0
        })
      ).status
    ).toBe(404);
  });

  it('adds a recurring cost (it becomes a renewal item) and toggles domain auto-renew', async () => {
    const c = await h.call('dev', 'POST', `/projects/${projectId}/costs`, {
      name: 'Cloudflare Pro',
      amountPaise: 170_000,
      cycle: 'Monthly',
      nextDue: addDays(today, 3)
    });
    expect(c.status).toBe(201);
    const items = (await h.call('owner', 'GET', `/projects/${projectId}/renewals`)).json.items as any[];
    expect(items.find(i => i.ref === `cost:${c.json.id}`)).toMatchObject({
      name: 'Cloudflare Pro',
      kind: 'Subscription'
    });
    expect(
      (
        await h.call('accounts', 'POST', `/projects/${projectId}/costs`, {
          name: 'x',
          amountPaise: 1,
          cycle: 'Monthly',
          nextDue: today
        })
      ).status
    ).toBe(403);
    expect((await h.call('dev', 'PATCH', `/projects/${projectId}/auto-renew`, { on: true })).json.on).toBe(
      true
    );
    expect((await h.call('owner', 'GET', `/projects/${projectId}`)).json.sheet.domain.auto).toBe('On');
    // Accounts see renewals without names or references
    const acc = (await h.call('accounts', 'GET', `/projects/${projectId}/renewals`)).json;
    expect(JSON.stringify(acc)).not.toContain('kaveri.example');
    expect(JSON.stringify(acc)).not.toContain('GD-88213490');
  });
});

describe('daily cron', () => {
  it('sends ONE digest per recipient, grouping items; a second run sends nothing new', async () => {
    // a domain + SSL expiring in 5 days: inside the 30- and 7-day intervals, never reminded yet
    const in5b = addDays(today, 5);
    const p = await h.call(
      'owner',
      'POST',
      '/projects',
      projectBody(clientId, {
        name: 'Second Shop',
        domain: { name: 'second.example', expiry: in5b, sslExpiry: in5b }
      })
    );
    expect(p.status).toBe(201);
    brevo = mockBrevo();
    const run = await h.call('owner', 'POST', '/admin/run-cron');
    expect(run.status).toBe(200);
    // Admin and Manager get a digest; Accounts only get invoice types (none due); Developers never
    expect(run.json.counts).toMatchObject({ digests: 2, skippedAlreadySent: 0 });
    expect(run.json.errors).toEqual([]);
    expect(brevo.calls).toHaveLength(2);
    const ownerMail = brevo.calls.find(c => c.to[0].email === 'owner@test.example');
    expect(ownerMail.htmlContent).toContain('second.example expires in 5 days');
    expect(ownerMail.htmlContent).toContain('SSL · second.example expires in 5 days');
    expect(ownerMail.subject).toMatch(/items due$/);
    expect(ownerMail.apiKey).toBe('test-brevo-key');

    const again = await h.call('owner', 'POST', '/admin/run-cron');
    expect(again.json.counts).toMatchObject({ digests: 0, skippedAlreadySent: 2 });
    expect(brevo.calls).toHaveLength(2);

    const runs = await h.call('admin', 'GET', '/admin/cron-runs');
    expect(runs.json.items).toHaveLength(2);
    const digests = await h.sql<{ n: number }>("SELECT count(*) AS n FROM emails WHERE kind = 'digest'");
    expect(digests[0]!.n).toBe(2);
  });

  it('a date that reaches a new interval later gets its own reminder', async () => {
    brevo = mockBrevo();
    // a subscription due tomorrow: reaches the 14- and 7-day intervals now (1 isn't offered for subscriptions by default)
    await h.call('dev', 'POST', `/projects/${projectId}/costs`, {
      name: 'Algolia',
      amountPaise: 50_000,
      cycle: 'Monthly',
      nextDue: addDays(today, 1)
    });
    const run = await h.call('owner', 'POST', '/admin/run-cron');
    expect(run.json.counts.digests).toBe(2);
    expect(brevo.calls[0].htmlContent).toContain('Algolia renews in 1 day');
    expect(brevo.calls[0].htmlContent).not.toContain('second.example');
  });

  it('a digest that fails is retried on the next run', async () => {
    await h.call('dev', 'POST', '/notices', {
      title: 'DB upgrade',
      body: null,
      date: addDays(today, 1),
      type: 'Upcoming maintenance'
    });
    brevo = mockBrevo(() => ({ status: 500, json: { message: 'down' } }));
    const failed = await h.call('owner', 'POST', '/admin/run-cron');
    expect(failed.json.counts.digests).toBe(0);
    expect(failed.json.errors[0]).toMatch(/Brevo 500/);
    brevo.restore();
    brevo = mockBrevo();
    const retry = await h.call('owner', 'POST', '/admin/run-cron');
    expect(retry.json.counts.digests).toBe(2);
    expect(brevo.calls[0].htmlContent).toContain('DB upgrade');
  });

  it('only Admins can run it by hand', async () => {
    expect((await h.call('admin', 'POST', '/admin/run-cron')).status).toBe(403);
  });
});
