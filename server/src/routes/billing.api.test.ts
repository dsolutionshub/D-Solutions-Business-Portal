/**
 * Releases → Billable work → Invoices → Payments, end to end against a local D1.
 * Covers the step-4 rules: work status through the whole cycle, partial/over payment, void,
 * duplicate, edits after issue, invoice numbering, and who may do what.
 */
import { addDays, todayIso } from '@dsol/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clientBody, createHarness, type Harness } from '../test/harness';

let h: Harness;
let clientId: string;
let projectId: string;
let releaseId: string;
const today = todayIso();
const blank = (keys: string[]) => Object.fromEntries(keys.map(k => [k, null]));

const statusOf = async (title: string) =>
  (
    (await h.call('owner', 'GET', `/work?status=all&q=${encodeURIComponent(title)}`)).json.items as any[]
  ).find(w => w.title === title)?.status;

beforeAll(async () => {
  h = await createHarness();
  clientId = (await h.call('owner', 'POST', '/clients', clientBody({ paymentTerms: 'Net 15' }))).json.id;
  projectId = (
    await h.call('owner', 'POST', '/projects', {
      project: {
        clientId,
        name: 'Kaveri Storefront',
        type: null,
        status: 'Active',
        startDate: null,
        stack: null,
        environments: ['STG', 'PROD']
      },
      sheet: {
        links: {
          ...blank(['staging', 'admin', 'api', 'apiStaging', 'repo']),
          prod: 'https://shop.example.com'
        },
        domain: {
          ...blank([
            'name',
            'registrar',
            'account',
            'purchased',
            'expiry',
            'cost',
            'renewal',
            'dns',
            'sslProvider',
            'sslExpiry',
            'sslCost'
          ]),
          auto: 'Off'
        },
        hosting: blank(['platform', 'plan', 'region', 'ip', 'account', 'cost', 'cycle', 'nextBill']),
        db: blank(['engine', 'host', 'port', 'name', 'user', 'console', 'backup']),
        keys: blank(['googleClientId', 'payGateway', 'payKeyId', 'shipping', 'ga4', 'pixel']),
        notes: null
      }
    })
  ).json.project.id;
});
afterAll(() => h?.dispose());

describe('releases', () => {
  it('Developers create releases; Accounts cannot', async () => {
    const body = {
      projectId,
      version: '1.0.0',
      environment: 'PROD',
      releaseDate: today,
      status: 'Scheduled',
      releasedBy: 'us_dev',
      features: ['Size guide', 'Express checkout'],
      fixes: ['Cart flicker'],
      issues: ['Legacy SKUs lack sizes']
    };
    expect((await h.call('accounts', 'POST', '/releases', body)).status).toBe(403);
    const r = await h.call('dev', 'POST', '/releases', body);
    expect(r.status).toBe(201);
    releaseId = r.json.id;
    expect(r.json).toMatchObject({
      version: 'v1.0.0',
      clientName: 'Kaveri Naturals',
      releasedByName: 'Developer User',
      mailStatus: 'Not sent'
    });
    expect(r.json.billing).toMatchObject({ items: 3, added: 0 });
  });

  it('only accepts environments from the dropdown list', async () => {
    const r = await h.call('dev', 'POST', '/releases', {
      projectId,
      version: 'v9.9.9',
      environment: 'MARS',
      releaseDate: today,
      status: 'Draft',
      releasedBy: null,
      features: ['x'],
      fixes: [],
      issues: []
    });
    expect(r.status).toBe(400);
    expect(r.json.error.fields.environment).toMatch(/Dropdown lists/);
  });

  it('marks deployed and exports notes', async () => {
    expect((await h.call('dev', 'POST', `/releases/${releaseId}/mark-deployed`)).json.status).toBe(
      'Deployed'
    );
    const notes = await h.call('dev', 'GET', `/releases/${releaseId}/notes.txt`);
    expect(notes.text).toContain('Kaveri Storefront v1.0.0');
    expect(notes.text).toContain('- Cart flicker');
  });

  it('adds features and fixes to Billable work once (hourly uses the Settings rate)', async () => {
    const items = [
      { title: 'Size guide', kind: 'Feature', billing: 'Fixed', value: 1_000_000 },
      { title: 'Express checkout', kind: 'Feature', billing: 'Hourly', value: 4 },
      { title: 'Cart flicker', kind: 'Bug fix', billing: 'Free', value: null }
    ];
    const r = await h.call('dev', 'POST', `/releases/${releaseId}/bill`, { items });
    expect(r.json).toMatchObject({ added: 3, skipped: 0 });
    expect(r.json.release.billing).toMatchObject({ added: 3, open: 2, notBillable: 1 });
    expect((await h.call('dev', 'POST', `/releases/${releaseId}/bill`, { items })).json).toMatchObject({
      added: 0,
      skipped: 3
    });
    expect(await statusOf('Size guide')).toBe('To bill');
    expect(await statusOf('Cart flicker')).toBe('Not billable');
    const hourly = (await h.call('dev', 'GET', '/work?status=all&q=Express')).json.items[0];
    expect(hourly).toMatchObject({
      hours: 4,
      ratePaise: 150000,
      billablePaise: 600000,
      releaseVersion: 'v1.0.0'
    });
  });
});

describe('the billing cycle: To bill → Invoiced → Part paid → Paid', () => {
  let no: string;
  let workIds: string[];

  it('lists work with counts and the Ready-to-invoice card', async () => {
    const r = await h.call('accounts', 'GET', '/work?status=open');
    workIds = r.json.items.map((w: any) => w.id);
    expect(r.json.items.map((w: any) => w.status)).toEqual(['To bill', 'To bill']);
    expect(r.json.summary.toBill).toEqual({ count: 2, amountPaise: 1_600_000, clients: 1 });
    expect(r.json.counts).toMatchObject({ open: 2, 'Not billable': 1, all: 3 });
  });

  it('prefills an invoice from the chosen work (prototype line wording, due by client terms)', async () => {
    const d = await h.call('accounts', 'GET', `/invoices/new-from-work?ids=${workIds.join(',')}`);
    expect(d.json).toMatchObject({
      clientId,
      projectId,
      issueDate: today,
      dueDate: addDays(today, 15),
      gstRate: 0 // no GST on invoices
    });
    expect(d.json.lines).toEqual(
      expect.arrayContaining([
        {
          description: 'Feature: Size guide (v1.0.0)',
          quantity: 1,
          unitPricePaise: 1_000_000,
          workItemId: expect.any(String)
        },
        {
          description: 'Feature: Express checkout (v1.0.0) — 4 h',
          quantity: 4,
          unitPricePaise: 150_000,
          workItemId: expect.any(String)
        }
      ])
    );
    expect(d.json.paymentInstructions).toBe('HDFC · A/c 1234\nUPI: dsol@upi');
  });

  it('Developers cannot see or create invoices', async () => {
    expect((await h.call('dev', 'GET', '/invoices')).status).toBe(403);
    expect((await h.call('dev', 'POST', '/invoices', {})).status).toBe(403);
  });

  it('Accounts create a draft with an allocated number; work is "In draft"', async () => {
    const d = (await h.call('accounts', 'GET', `/invoices/new-from-work?ids=${workIds.join(',')}`)).json;
    const r = await h.call('accounts', 'POST', '/invoices', { ...d, status: 'Draft' });
    expect(r.status).toBe(201);
    no = r.json.number;
    expect(no).toBe('INV-T-0001');
    expect(r.json).toMatchObject({
      status: 'Draft',
      subtotalPaise: 1_600_000,
      taxPaise: 0,
      totalPaise: 1_600_000
    });
    expect(r.json.work.map((w: any) => w.status)).toEqual(['In draft', 'In draft']);
  });

  it('rejects the same work on another invoice', async () => {
    const d = (await h.call('accounts', 'GET', '/invoices/new')).json;
    const r = await h.call('accounts', 'POST', '/invoices', {
      ...d,
      clientId,
      status: 'Draft',
      lines: [{ description: 'Again', quantity: 1, unitPricePaise: 100, workItemId: workIds[0] }]
    });
    expect(r.status).toBe(409);
    expect(r.json.error.fields['lines.0.workItemId']).toMatch(/already on INV-T-0001/);
  });

  it('issues the draft; issued invoices cannot be edited', async () => {
    expect((await h.call('accounts', 'POST', `/invoices/${no}/issue`)).json.status).toBe('Sent');
    expect(await statusOf('Size guide')).toBe('Invoiced');
    const d = (await h.call('accounts', 'GET', `/invoices/${no}`)).json;
    const r = await h.call('accounts', 'PATCH', `/invoices/${no}`, {
      clientId,
      projectId,
      issueDate: d.issueDate,
      dueDate: d.dueDate,
      discountPct: 0,
      gstRate: 18,
      notes: 'changed',
      paymentInstructions: null,
      terms: null,
      lines: d.lines.map((l: any) => ({
        description: l.description,
        quantity: l.quantity,
        unitPricePaise: l.unitPricePaise,
        workItemId: l.workItemId
      }))
    });
    expect(r.status).toBe(409);
    expect(r.json.error.message).toMatch(/can't be edited/);
  });

  it('records a partial payment → Partially paid / Part paid; rejects overpayment, future dates and Developers', async () => {
    const pay = (as: any, over: object = {}) =>
      h.call(as, 'POST', '/payments', {
        invoiceNo: no,
        amountPaise: 600_000,
        paidOn: today,
        method: 'NEFT',
        reference: 'UTR0001',
        note: null,
        ...over
      });
    expect((await pay('dev')).status).toBe(403);
    expect((await pay('accounts', { amountPaise: 1_600_001 })).json.error.fields.amountPaise).toBe(
      'Exceeds balance due (₹16,000).'
    );
    expect((await pay('accounts', { paidOn: addDays(today, 1) })).status).toBe(400);
    expect((await pay('accounts', { reference: 'abc' })).status).toBe(400);
    const r = await pay('accounts');
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({
      settled: false,
      workPaid: 0,
      invoice: { status: 'Partially paid', paidPaise: 600_000, balancePaise: 1_000_000 }
    });
    expect(r.json.payment.receiptNo).toBe('RCPT-0001');
    expect(await statusOf('Size guide')).toBe('Part paid');
  });

  it('cannot void an invoice that has payments', async () => {
    const r = await h.call('accounts', 'POST', `/invoices/${no}/void`);
    expect(r.status).toBe(409);
    expect(r.json.error.message).toMatch(/₹6,000 in payments/);
  });

  it('a payment that settles the invoice makes its work Paid', async () => {
    const r = await h.call('accounts', 'POST', '/payments', {
      invoiceNo: no,
      amountPaise: 1_000_000,
      paidOn: today,
      method: 'UPI',
      reference: 'UPI/9988',
      note: 'final'
    });
    expect(r.json).toMatchObject({
      settled: true,
      workPaid: 2,
      invoice: { status: 'Paid', balancePaise: 0 }
    });
    expect(r.json.payment.receiptNo).toBe('RCPT-0002');
    expect(await statusOf('Size guide')).toBe('Paid');
    expect(await statusOf('Express checkout')).toBe('Paid');
    expect(
      (
        await h.call('accounts', 'POST', '/payments', {
          invoiceNo: no,
          amountPaise: 1,
          paidOn: today,
          method: 'UPI',
          reference: 'UPI/9989',
          note: null
        })
      ).status
    ).toBe(409);
  });

  it('duplicating copies the lines without re-billing the work', async () => {
    const r = await h.call('accounts', 'POST', `/invoices/${no}/duplicate`);
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({
      number: 'INV-T-0002',
      status: 'Draft',
      issueDate: today,
      totalPaise: 1_600_000
    });
    expect(r.json.lines.every((l: any) => l.workItemId === null)).toBe(true);
    expect(r.json.work).toEqual([]);
    expect(await statusOf('Size guide')).toBe('Paid');
  });

  it('serves the printable invoice and receipt', async () => {
    const pdf = await h.call('accounts', 'GET', `/invoices/${no}/pdf`);
    expect(pdf.headers.get('Content-Type')).toMatch(/text\/html/);
    expect(pdf.text).toContain('INVOICE');
    expect(pdf.text).toContain('INV-T-0001');
    expect(pdf.text).toContain('₹16,000');
    const pays = (await h.call('accounts', 'GET', `/payments?invoice=${no}`)).json;
    expect(pays.total).toBe(2);
    expect(pays.totalPaise).toBe(1_600_000);
    const receipt = await h.call('accounts', 'GET', `/payments/${pays.items[0].id}/receipt`);
    expect(receipt.text).toContain('RCPT-0002');
  });

  it('keeps releases and work that are on invoices', async () => {
    expect((await h.call('dev', 'DELETE', `/releases/${releaseId}`)).status).toBe(409);
    expect((await h.call('dev', 'DELETE', `/work/${workIds[0]}`)).status).toBe(409);
    expect((await h.call('dev', 'POST', `/work/${workIds[0]}/toggle-billable`)).status).toBe(409);
  });
});

describe('void', () => {
  it('returns the work to "To bill" so it can be invoiced again; Developers cannot void', async () => {
    const w = await h.call('dev', 'POST', '/work', {
      projectId,
      releaseId: null,
      type: 'Support',
      title: 'Payment gateway migration',
      deliveredOn: today,
      billing: 'Fixed',
      amountPaise: 500_000,
      hours: 0,
      ratePaise: 0,
      note: null
    });
    expect(w.status).toBe(201);
    const draft = (await h.call('accounts', 'GET', `/invoices/new-from-work?ids=${w.json.id}`)).json;
    const inv = (await h.call('accounts', 'POST', '/invoices', { ...draft, status: 'Sent' })).json;
    expect(await statusOf('Payment gateway migration')).toBe('Invoiced');

    expect((await h.call('dev', 'POST', `/invoices/${inv.number}/void`)).status).toBe(403);
    const v = await h.call('accounts', 'POST', `/invoices/${inv.number}/void`);
    expect(v.json.status).toBe('Void');
    expect(await statusOf('Payment gateway migration')).toBe('To bill');
    expect(
      (
        await h.call('accounts', 'POST', '/payments', {
          invoiceNo: inv.number,
          amountPaise: 1,
          paidOn: today,
          method: 'UPI',
          reference: 'UPI/0001',
          note: null
        })
      ).status
    ).toBe(409);

    const again = (await h.call('accounts', 'GET', `/invoices/new-from-work?ids=${w.json.id}`)).json;
    const r = await h.call('accounts', 'POST', '/invoices', { ...again, status: 'Draft' });
    expect(r.status).toBe(201);
    expect(await statusOf('Payment gateway migration')).toBe('In draft');
  });

  it('a draft that drops a work line releases that work', async () => {
    const list = (await h.call('accounts', 'GET', '/invoices?status=Draft&sort=number:desc')).json.items;
    const latest = (await h.call('accounts', 'GET', `/invoices/${list[0].number}`)).json;
    const r = await h.call('accounts', 'PATCH', `/invoices/${latest.number}`, {
      clientId,
      projectId: latest.projectId,
      issueDate: latest.issueDate,
      dueDate: latest.dueDate,
      discountPct: 10,
      gstRate: 18,
      notes: null,
      paymentInstructions: null,
      terms: null,
      lines: [{ description: 'Retainer', quantity: 1, unitPricePaise: 100_000, workItemId: null }]
    });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ discountPaise: 10_000, totalPaise: 106_200 });
    expect(await statusOf('Payment gateway migration')).toBe('To bill');
  });
});

describe('invoice numbers', () => {
  it('never collide, even when created at the same time', async () => {
    const d = { ...(await h.call('owner', 'GET', `/invoices/new?client=${clientId}`)).json, status: 'Draft' };
    d.lines = [{ description: 'Retainer', quantity: 1, unitPricePaise: 100_000, workItemId: null }];
    const results = await Promise.all(
      Array.from({ length: 6 }, () => h.call('owner', 'POST', '/invoices', d))
    );
    const numbers = results.map(r => r.json.number);
    expect(results.every(r => r.status === 201)).toBe(true);
    expect(new Set(numbers).size).toBe(6);
    const [row] = await h.sql<{ next_invoice_no: number }>('SELECT next_invoice_no FROM settings');
    expect(row!.next_invoice_no).toBe(Math.max(...numbers.map(n => Number(n.slice(-4)))) + 1);
  });

  it('explains a clash with an existing number instead of failing silently', async () => {
    await h.sql('UPDATE settings SET next_invoice_no = 1');
    const d = { ...(await h.call('owner', 'GET', `/invoices/new?client=${clientId}`)).json, status: 'Draft' };
    d.lines = [{ description: 'Retainer', quantity: 1, unitPricePaise: 100, workItemId: null }];
    const r = await h.call('owner', 'POST', '/invoices', d);
    expect(r.status).toBe(409);
    expect(r.json.error.message).toBe(
      'Invoice number INV-T-0001 already exists. Raise “Next invoice number” in Settings.'
    );
  });

  it('lists with status counts and the summary cards', async () => {
    const r = await h.call('accounts', 'GET', '/invoices');
    expect(r.json.counts).toMatchObject({ Paid: 1, Void: 1 });
    expect(r.json.summary.collectedThisMonthPaise).toBe(1_600_000);
  });
});
