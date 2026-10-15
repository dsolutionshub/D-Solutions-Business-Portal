/**
 * Email (Brevo mocked): sending, invoice / receipt links, the daily limit, failures, release
 * emails, dev logging — and reports whose totals match invoices and payments.
 */
import { todayIso } from '@dsol/shared';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { clientBody, createHarness, mockBrevo, projectBody, type Harness } from '../test/harness';

let h: Harness;
let clientId: string;
let projectId: string;
let invoiceNo: string;
let paymentId: string;
const today = todayIso();
let brevo: ReturnType<typeof mockBrevo> | null = null;
afterEach(() => {
  brevo?.restore();
  brevo = null;
});

beforeAll(async () => {
  h = await createHarness();
  clientId = (await h.call('owner', 'POST', '/clients', clientBody())).json.id;
  // a billing contact, and release emails on for the primary contact
  await h.call('owner', 'POST', `/clients/${clientId}/contacts`, {
    name: 'Karan Desai',
    role: 'Finance',
    email: 'accounts@kaveri.example',
    phone: null,
    altPhone: null,
    tag: 'Billing',
    notifyReleases: false
  });
  const contacts = (await h.call('owner', 'GET', `/clients/${clientId}/contacts`)).json.items as any[];
  const primary = contacts.find(c => c.tag === 'Primary');
  await h.call('owner', 'PATCH', `/contacts/${primary.id}`, { notifyReleases: true });

  projectId = (await h.call('owner', 'POST', '/projects', projectBody(clientId))).json.project.id;
  const draft = (await h.call('owner', 'GET', `/invoices/new?client=${clientId}`)).json;
  const inv = await h.call('owner', 'POST', '/invoices', {
    ...draft,
    projectId,
    status: 'Sent',
    lines: [{ description: 'Storefront build', quantity: 1, unitPricePaise: 10_000_000, workItemId: null }]
  });
  invoiceNo = inv.json.number;
  const pay = await h.call('owner', 'POST', '/payments', {
    invoiceNo,
    amountPaise: 5_000_000,
    paidOn: today,
    method: 'NEFT',
    reference: 'UTR123456',
    note: null
  });
  paymentId = pay.json.payment.id;
});
afterAll(() => h?.dispose());

describe('invoice, receipt and reminder emails', () => {
  it('prefills an invoice email for the billing contact with a link, no unfilled variables', async () => {
    const p = await h.call('accounts', 'GET', `/emails/prefill?for=invoice&invoice=${invoiceNo}`);
    expect(p.json).toMatchObject({
      clientId,
      to: ['accounts@kaveri.example'],
      template: 'Invoice Notification',
      subject: `Invoice ${invoiceNo} from D Solutions`,
      attachments: [{ kind: 'invoice', invoiceNo }],
      missing: [],
      unknown: []
    });
    expect(p.json.html).toContain('Hi Karan,');
    expect(p.json.html).toContain('₹1,00,000'); // no GST on invoices
  });

  it('sends through Brevo with a signed link that works without signing in', async () => {
    brevo = mockBrevo();
    const p = (await h.call('accounts', 'GET', `/emails/prefill?for=invoice&invoice=${invoiceNo}`)).json;
    const r = await h.call('accounts', 'POST', '/emails/send', {
      clientId,
      to: p.to,
      cc: ['owner@test.example'],
      subject: p.subject,
      html: p.html,
      template: p.template,
      attachments: p.attachments
    });
    expect(r.status).toBe(201);
    expect(r.json.status).toBe('Sent');
    expect(r.json.email).toMatchObject({
      invoiceNo,
      attachmentCount: 1,
      recipientCount: 2,
      toText: 'Karan Desai',
      providerMessageId: '<test@brevo>'
    });
    const sent = brevo.calls[0];
    expect(sent.sender).toEqual({ name: 'D Solutions', email: 'no-reply@portal.test' });
    expect(sent.cc).toEqual([{ email: 'owner@test.example' }]);
    const link = /href="(https:\/\/portal\.test\/api\/public\/invoices\/[^"]+)"/
      .exec(sent.htmlContent)![1]!
      .replace(/&amp;/g, '&');
    const path = link.replace('https://portal.test/api', '');
    const page = await h.call(null, 'GET', path);
    expect(page.status).toBe(200);
    expect(page.text).toContain(invoiceNo);
    // tampered or missing signatures are refused
    expect((await h.call(null, 'GET', path.replace(/sig=[^&]+/, 'sig=AAAA'))).status).toBe(403);
    expect((await h.call(null, 'GET', `/public/invoices/${invoiceNo}`)).status).toBe(403);
  });

  it('receipt and reminder emails link the receipt / invoice', async () => {
    const r = (await h.call('accounts', 'GET', `/emails/prefill?for=receipt&payment=${paymentId}`)).json;
    expect(r.subject).toBe(`Payment received — ${invoiceNo}`);
    expect(r.html).toContain('₹50,000');
    expect(r.attachments).toEqual([{ kind: 'receipt', paymentId }]);
    const m = (await h.call('accounts', 'GET', `/emails/prefill?for=reminder&invoice=${invoiceNo}`)).json;
    expect(m.html).toContain('₹50,000'); // balance
  });

  it('Developers can’t prefill or attach billing documents', async () => {
    expect((await h.call('dev', 'GET', `/emails/prefill?for=invoice&invoice=${invoiceNo}`)).status).toBe(403);
    const r = await h.call('dev', 'POST', '/emails/send', {
      clientId,
      to: ['a@b.example'],
      subject: 'x',
      html: '<p>x</p>',
      attachments: [{ kind: 'invoice', invoiceNo }]
    });
    expect(r.status).toBe(403);
  });
});

describe('sending rules', () => {
  it('refuses unresolved {{variables}} and [placeholders]', async () => {
    const r = await h.call('owner', 'POST', '/emails/send', {
      clientId,
      to: ['a@b.example'],
      subject: 'Hi {{client_name}}',
      html: '<p>[Your announcement]</p>'
    });
    expect(r.status).toBe(400);
    expect(r.json.error.fields.html).toMatch(/\{\{client_name\}\}/);
  });

  it('strips scripts and unsafe links from the body', async () => {
    brevo = mockBrevo();
    await h.call('owner', 'POST', '/emails/send', {
      clientId,
      to: ['a@b.example'],
      subject: 'Hello',
      html: '<p onclick="x()">Hi<script>alert(1)</script> <a href="javascript:alert(1)">bad</a> <a href="https://ok.example">ok</a></p>'
    });
    const html = brevo.calls[0].htmlContent as string;
    expect(html).not.toMatch(/script|onclick|javascript:/);
    expect(html).toContain('<a href="https://ok.example"');
  });

  it('records Brevo failures in the history', async () => {
    brevo = mockBrevo(() => ({ status: 400, json: { message: 'sender not verified' } }));
    const r = await h.call('owner', 'POST', '/emails/send', {
      clientId,
      to: ['a@b.example'],
      subject: 'Will fail',
      html: '<p>x</p>'
    });
    expect(r.json.status).toBe('Failed');
    expect(r.json.email.error).toBe('Brevo 400: sender not verified');
    brevo.restore();
    brevo = mockBrevo();
    const retry = await h.call('owner', 'POST', `/emails/${r.json.email.id}/resend`);
    expect(retry.json.status).toBe('Sent');
  });

  it('schedules for later (sent by the daily cron), and can cancel', async () => {
    brevo = mockBrevo();
    const at = new Date(Date.now() + 3_600_000).toISOString();
    const r = await h.call('owner', 'POST', '/emails/send', {
      clientId,
      to: ['a@b.example'],
      subject: 'Later',
      html: '<p>x</p>',
      scheduledAt: at
    });
    expect(r.json.status).toBe('Scheduled');
    expect(brevo.calls).toHaveLength(0);
    const c = await h.call('owner', 'POST', `/emails/${r.json.email.id}/cancel`);
    expect(c.json.status).toBe('Draft');
  });

  it('stops at the daily limit and says so', async () => {
    brevo = mockBrevo();
    const q = (await h.call('owner', 'GET', '/emails/quota')).json;
    await h.call('owner', 'PATCH', '/settings', { emailDailyLimit: q.used + 2 });
    const ok = await h.call('owner', 'POST', '/emails/send', {
      clientId,
      to: ['a@b.example', 'c@d.example'],
      subject: 'Fits',
      html: '<p>x</p>'
    });
    expect(ok.status).toBe(201);
    const over = await h.call('owner', 'POST', '/emails/send', {
      clientId,
      to: ['a@b.example'],
      subject: 'Too many',
      html: '<p>x</p>'
    });
    expect(over.status).toBe(429);
    expect(over.json.error.message).toMatch(/Daily email limit reached/);
    expect((await h.call('owner', 'GET', '/emails/quota')).json).toMatchObject({
      blocked: true,
      warning: true
    });
    await h.call('owner', 'PATCH', '/settings', { emailDailyLimit: 300 });
  });
});

describe('release email', () => {
  it('goes to contacts with release emails on and marks the release Sent', async () => {
    brevo = mockBrevo();
    const rel = await h.call('dev', 'POST', '/releases', {
      projectId,
      version: '2.0.0',
      environment: 'PROD',
      releaseDate: today,
      status: 'Deployed',
      releasedBy: null,
      features: ['Wishlist <beta>'],
      fixes: ['Cart rounding'],
      issues: []
    });
    const p = (await h.call('dev', 'GET', `/emails/prefill?for=release&release=${rel.json.id}`)).json;
    expect(p.to).toEqual(['ananya@kaverinaturals.example']);
    expect(p.subject).toBe('Kaveri Storefront v2.0.0 is live');
    expect(p.html).toContain('<li>Wishlist &lt;beta&gt;</li>');
    const r = await h.call('dev', 'POST', '/emails/send', {
      clientId: p.clientId,
      to: p.to,
      subject: p.subject,
      html: p.html,
      template: p.template,
      releaseId: p.releaseId
    });
    expect(r.json.status).toBe('Sent');
    expect((await h.call('dev', 'GET', `/releases/${rel.json.id}`)).json.mailStatus).toBe('Sent');
  });
});

describe('history', () => {
  it('lists emails with filters and stats', async () => {
    const all = await h.call('dev', 'GET', '/emails');
    expect(all.json.total).toBeGreaterThan(3);
    expect(all.json.stats.failed).toBe(0); // the failed one was retried
    const failedFilter = await h.call('dev', 'GET', `/emails?client=${clientId}&q=release`);
    expect(failedFilter.status).toBe(200);
    const t = await h.call('dev', 'GET', '/templates');
    expect(t.json.items.map((x: any) => x.name)).toContain('Payment Receipt');
    expect((await h.call('dev', 'PATCH', `/templates/${t.json.items[0].id}`, { subject: 'x' })).status).toBe(
      403
    );
  });
});

describe('local development without a Brevo key', () => {
  it('logs the email instead of sending, and never fails the flow', async () => {
    const dev = await createHarness({ ENVIRONMENT: 'development', BREVO_API_KEY: '' });
    try {
      const cid = (await dev.call('owner', 'POST', '/clients', clientBody({ name: 'Dev Client' }))).json.id;
      brevo = mockBrevo();
      const r = await dev.call('owner', 'POST', '/emails/send', {
        clientId: cid,
        to: ['a@b.example'],
        subject: 'Dev',
        html: '<p>x</p>'
      });
      expect(r.json.status).toBe('Logged (dev)');
      expect(brevo.calls).toHaveLength(0);
      expect((await dev.call('owner', 'GET', '/emails/quota')).json.devMode).toBe(true);
    } finally {
      await dev.dispose();
    }
  });
});

describe('reports', () => {
  it('totals match invoices and payments', async () => {
    const r = await h.call('accounts', 'GET', '/reports?range=6M');
    expect(r.status).toBe(200);
    const invoices = (await h.call('accounts', 'GET', '/invoices?status=all&pageSize=100')).json
      .items as any[];
    const issued = invoices.filter(v => v.storedStatus === 'Sent');
    expect(r.json.totals.invoicedPaise).toBe(issued.reduce((a, v) => a + v.totalPaise, 0));
    expect(r.json.totals.collectedPaise).toBe(5_000_000);
    expect(r.json.totals.outstandingPaise).toBe(issued.reduce((a, v) => a + v.balancePaise, 0));
    expect(r.json.ageing[0]).toMatchObject({ bucket: '0–30 days', balancePaise: 5_000_000, count: 1 });
    expect(r.json.clients[0]).toMatchObject({
      clientId,
      invoicedPaise: 10_000_000,
      collectedPaise: 5_000_000
    });
    expect(r.json.monthly).toHaveLength(6);
  });

  it('exports each report as CSV', async () => {
    const r = await h.call('owner', 'GET', '/reports/clients.csv?range=12M');
    expect(r.headers.get('content-type')).toContain('text/csv');
    expect(r.text.split('\n')[0]).toBe('"Client","Invoiced (₹)","Collected (₹)"');
    expect(r.text).toContain('"Kaveri Naturals",100000,50000');
    expect((await h.call('owner', 'GET', '/reports/nope.csv')).status).toBe(404);
  });
});
