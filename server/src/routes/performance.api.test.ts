/**
 * No N+1 queries: every list page runs the same number of D1 queries whether it shows 2 rows or 12.
 * Lists are paginated on the server (pageSize ≤ 100).
 */
import { todayIso } from '@dsol/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clientBody, createHarness, projectBody, type Harness } from '../test/harness';

let h: Harness;
const LISTS = [
  '/clients',
  '/projects',
  '/releases',
  '/work?status=all',
  '/invoices',
  '/payments',
  '/emails',
  '/alerts',
  '/reports'
];

async function addClient(i: number) {
  const c = (await h.call('owner', 'POST', '/clients', clientBody({ name: `Client ${i}` }))).json.id;
  const p = (
    await h.call(
      'owner',
      'POST',
      '/projects',
      projectBody(c, { name: `Shop ${i}`, domain: { name: `shop${i}.example`, expiry: todayIso() } })
    )
  ).json.project.id;
  await h.call('owner', 'POST', '/work', {
    projectId: p,
    releaseId: null,
    type: 'Feature',
    title: `Feature ${i}`,
    deliveredOn: todayIso(),
    billing: 'Fixed',
    amountPaise: 100_000,
    hours: 0,
    ratePaise: 0,
    note: null
  });
  const draft = (await h.call('owner', 'GET', `/invoices/new?client=${c}`)).json;
  const inv = await h.call('owner', 'POST', '/invoices', {
    ...draft,
    status: 'Sent',
    lines: [{ description: 'Build', quantity: 1, unitPricePaise: 500_000, workItemId: null }]
  });
  await h.call('owner', 'POST', '/payments', {
    invoiceNo: inv.json.number,
    amountPaise: 100_000,
    paidOn: todayIso(),
    method: 'UPI',
    reference: `UTR000${i}`,
    note: null
  });
}

async function queriesPerList() {
  const out: Record<string, number> = {};
  for (const path of LISTS) {
    out[path] = await h.countQueries(async () => {
      const r = await h.call('owner', 'GET', path);
      expect(r.status, path).toBe(200);
    });
  }
  return out;
}

beforeAll(async () => {
  h = await createHarness();
});
afterAll(() => h?.dispose());

describe('list pages', () => {
  it('run a fixed number of queries, however many rows there are', async () => {
    for (let i = 0; i < 2; i++) await addClient(i);
    const few = await queriesPerList();
    for (let i = 2; i < 12; i++) await addClient(i);
    const many = await queriesPerList();
    expect(many).toEqual(few);
    // and few in absolute terms (auth + data)
    for (const [path, n] of Object.entries(many)) {
      expect(n, path).toBeGreaterThan(0); // the counter works
      expect(n, path).toBeLessThanOrEqual(12);
    }
  });

  it('cap page sizes at 100', async () => {
    expect((await h.call('owner', 'GET', '/clients?pageSize=500')).status).toBe(400);
    expect((await h.call('owner', 'GET', '/clients?pageSize=5')).json.items).toHaveLength(5);
  });
});
