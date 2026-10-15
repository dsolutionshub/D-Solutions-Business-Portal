import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clientBody, createHarness, projectBody, type Harness } from '../test/harness';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(() => h?.dispose());

describe('auth & /me', () => {
  it('returns the user and role for a known Access email', async () => {
    const r = await h.call('owner', 'GET', '/me');
    expect(r.status).toBe(200);
    expect(r.json).toEqual({
      email: 'owner@test.example',
      user: expect.objectContaining({ role: 'Admin' }),
      via: 'access'
    });
    expect(r.headers.get('Cache-Control')).toBe('no-store');
  });

  it('answers /me for an unknown email but refuses everything else', async () => {
    expect((await h.call('stranger', 'GET', '/me')).json.user).toBeNull();
    const r = await h.call('stranger', 'GET', '/clients');
    expect(r.status).toBe(403);
    expect(r.json.error.message).toMatch(/Ask an Admin to add you/);
  });

  it('is 401 without the Access header in production', async () => {
    expect((await h.call(null, 'GET', '/clients')).status).toBe(401);
  });
});

describe('clients', () => {
  let id: string;

  it('creates a client with its primary contact', async () => {
    const r = await h.call('owner', 'POST', '/clients', clientBody());
    expect(r.status).toBe(201);
    id = r.json.id;
    expect(id).toMatch(/^cl_/);
    expect(r.json).toMatchObject({
      name: 'Kaveri Naturals',
      currency: 'INR',
      paymentTerms: 'Net 15',
      gstin: null
    });
    expect(r.json.primaryContact).toMatchObject({ name: 'Ananya Rao', tag: 'Primary', notifyReleases: true });
  });

  it('rejects a duplicate name, ignoring case, with a field error (409)', async () => {
    const r = await h.call('owner', 'POST', '/clients', clientBody({ name: 'KAVERI naturals' }));
    expect(r.status).toBe(409);
    expect(r.json.error.fields).toEqual({ name: 'A client with this name already exists.' });
  });

  it('validates fields like the prototype (website optional but a real link, PIN 6 digits)', async () => {
    const r = await h.call(
      'owner',
      'POST',
      '/clients',
      clientBody({ name: 'Other', website: 'shop.example', pin: '5600' })
    );
    expect(r.status).toBe(400);
    expect(r.json.error.fields).toMatchObject({
      website: 'URL must start with http:// or https://',
      pin: 'PIN codes have 6 digits.'
    });
  });

  it('edits only the fields sent (omitted fields keep their values)', async () => {
    await h.sql(`UPDATE clients SET gstin = '29AAKCK1234F1Z5' WHERE id = ?`, id);
    const r = await h.call('owner', 'PATCH', `/clients/${id}`, {
      city: 'Mysuru',
      primaryContact: { ...clientBody().primaryContact, phone: '+91 90000 00000' }
    });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ city: 'Mysuru', gstin: '29AAKCK1234F1Z5', name: 'Kaveri Naturals' });
    expect(r.json.primaryContact.phone).toBe('+91 90000 00000');
  });

  it('lists with contact, filters and sorting', async () => {
    await h.call(
      'owner',
      'POST',
      '/clients',
      clientBody({
        name: 'UrbanLoom Apparel',
        status: 'Inactive',
        industry: 'Fashion & apparel',
        primaryContact: {
          name: 'Rohan Mehta',
          role: null,
          email: 'rohan@urbanloom.example',
          phone: '+91 98200 44567',
          altPhone: null
        }
      })
    );
    const all = await h.call('owner', 'GET', '/clients?sort=name:desc');
    expect(all.json.items.map((c: { name: string }) => c.name)).toEqual([
      'UrbanLoom Apparel',
      'Kaveri Naturals'
    ]);
    expect(all.json.items[1]).toMatchObject({
      contactName: 'Ananya Rao',
      contactPhone: '+91 90000 00000',
      activeProjects: 0
    });
    expect(all.json.summary).toMatchObject({ total: 2, active: 1, inactive: 1, archived: 0 });
    expect((await h.call('owner', 'GET', '/clients?status=Inactive')).json.total).toBe(1);
    expect(
      (await h.call('owner', 'GET', '/clients?q=ananya')).json.items.map((c: { name: string }) => c.name)
    ).toEqual(['Kaveri Naturals']);
    const paged = await h.call('owner', 'GET', '/clients?pageSize=1&page=2');
    expect(paged.json).toMatchObject({ total: 2, page: 2, pageSize: 1 });
    expect(paged.json.items).toHaveLength(1);
  });

  it('lets Accounts read clients but not edit them', async () => {
    expect((await h.call('accounts', 'GET', `/clients/${id}`)).status).toBe(200);
    expect((await h.call('accounts', 'PATCH', `/clients/${id}`, { city: 'X' })).status).toBe(403);
  });

  it('exports CSV', async () => {
    const r = await h.call('owner', 'GET', '/clients/export.csv');
    expect(r.headers.get('Content-Type')).toMatch(/text\/csv/);
    expect(r.text.split('\n')[0]).toContain('"Client","Website"');
    expect(r.text).toContain('"Kaveri Naturals"');
  });

  describe('contacts', () => {
    let contactId: string;
    it('adds a contact, toggles release emails, removes it', async () => {
      const add = await h.call('owner', 'POST', `/clients/${id}/contacts`, {
        name: 'Karan Desai',
        role: 'Head of Technology',
        email: 'karan@kaverinaturals.example',
        phone: null,
        altPhone: null,
        tag: 'Technical',
        notifyReleases: false
      });
      expect(add.status).toBe(201);
      contactId = add.json.id;
      const toggled = await h.call('owner', 'PATCH', `/contacts/${contactId}`, { notifyReleases: true });
      expect(toggled.json.notifyReleases).toBe(true);
      const list = await h.call('owner', 'GET', `/clients/${id}/contacts`);
      expect(list.json.items.map((c: { tag: string }) => c.tag)).toEqual(['Primary', 'Technical']);
      expect((await h.call('owner', 'DELETE', `/contacts/${contactId}`)).status).toBe(204);
    });

    it('protects the primary contact', async () => {
      const primary = (await h.call('owner', 'GET', `/clients/${id}`)).json.primaryContact.id;
      expect((await h.call('owner', 'DELETE', `/contacts/${primary}`)).status).toBe(409);
      const second = await h.call('owner', 'POST', `/clients/${id}/contacts`, {
        name: 'X',
        role: null,
        email: 'x@example.com',
        phone: null,
        altPhone: null,
        tag: 'Primary',
        notifyReleases: false
      });
      expect(second.status).toBe(400);
    });
  });

  describe('logo (R2)', () => {
    it('uploads, serves with a safe CSP, and rejects big files', async () => {
      const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
      const form = new FormData();
      form.append('file', new File([png], 'logo.png', { type: 'image/png' }));
      const up = await h.call('owner', 'POST', `/clients/${id}/logo`, form);
      expect(up.status).toBe(200);
      expect(up.json.logoUrl).toMatch(new RegExp(`^/api/clients/${id}/logo\\?v=`));
      const get = await h.call('owner', 'GET', `/clients/${id}/logo`);
      expect(get.status).toBe(200);
      expect(get.headers.get('Content-Type')).toBe('image/png');
      expect(get.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
      const big = new FormData();
      big.append('file', new File([new Uint8Array(1024 * 1024 + 1)], 'big.png', { type: 'image/png' }));
      expect((await h.call('owner', 'POST', `/clients/${id}/logo`, big)).status).toBe(413);
    });
  });

  describe('archive', () => {
    it('is blocked while the client has unpaid invoices, then allowed once paid', async () => {
      await h.sql(
        `INSERT INTO invoices (id, number, client_id, issue_date, due_date, status, gst_rate) VALUES ('in_1', 'INV-T-1', ?, '2026-09-01', '2026-09-15', 'Sent', 18)`,
        id
      );
      await h.sql(
        `INSERT INTO invoice_lines (id, invoice_id, description, quantity, unit_price_paise) VALUES ('il_1', 'in_1', 'Work', 1, 1000000)`
      );
      expect((await h.call('dev', 'POST', `/clients/${id}/archive`)).status).toBe(403); // Developers can't archive
      const blocked = await h.call('owner', 'POST', `/clients/${id}/archive`);
      expect(blocked.status).toBe(409);
      expect(blocked.json.error.message).toBe(
        'Kaveri Naturals has 1 unpaid invoice (₹11,800 due: INV-T-1). Record the payments or void them before archiving.'
      );

      await h.sql(
        `INSERT INTO payments (id, receipt_no, invoice_id, paid_on, method, reference, amount_paise) VALUES ('py_1', 'R-1', 'in_1', '2026-09-10', 'NEFT', 'UTR12345', 1180000)`
      );
      const ok = await h.call('owner', 'POST', `/clients/${id}/archive`);
      expect(ok.status).toBe(200);
      expect(ok.json.archivedAt).toBeTruthy();
      const audit = await h.sql(`SELECT action FROM audit_log WHERE entity_id = ?`, id);
      expect(audit.map(a => a.action)).toContain('client.archive');
    });

    it('hides archived clients from the default list, blocks edits, and restores', async () => {
      expect(
        (await h.call('owner', 'GET', '/clients')).json.items.some((c: { id: string }) => c.id === id)
      ).toBe(false);
      expect((await h.call('owner', 'GET', '/clients?status=Archived')).json.items[0].id).toBe(id);
      expect((await h.call('owner', 'PATCH', `/clients/${id}`, { city: 'X' })).status).toBe(409);
      const r = await h.call('owner', 'POST', `/clients/${id}/restore`);
      expect(r.status).toBe(200);
      expect(r.json.archivedAt).toBeNull();
    });
  });
});

describe('client social media', () => {
  it('keeps the brand social media pages on the client', async () => {
    const own = await createHarness();
    try {
      const r = await own.call(
        'owner',
        'POST',
        '/clients',
        clientBody({ name: 'Social Brand', instagram: 'https://instagram.com/social', youtube: null })
      );
      expect(r.status).toBe(201);
      const c = (await own.call('owner', 'GET', `/clients/${r.json.id}`)).json;
      expect(c).toMatchObject({ instagram: 'https://instagram.com/social', facebook: null, youtube: null });
      const bad = await own.call('owner', 'PATCH', `/clients/${r.json.id}`, { facebook: 'not a link' });
      expect(bad.status).toBe(400);
      expect(bad.json.error.fields.facebook).toBeTruthy();
    } finally {
      await own.dispose();
    }
  });
});

describe('deleting an archived client', () => {
  it('only archived clients without invoices; their projects, releases and contacts go too', async () => {
    const own = await createHarness();
    try {
      const id = (await own.call('owner', 'POST', '/clients', clientBody({ name: 'Gone Ltd' }))).json.id;
      const pj = await own.call('owner', 'POST', '/projects', projectBody(id, { name: 'Gone Store' }));
      expect(pj.status).toBe(201);

      expect((await own.call('owner', 'DELETE', `/clients/${id}`)).status).toBe(409); // not archived
      await own.call('owner', 'POST', `/clients/${id}/archive`);
      expect((await own.call('dev', 'DELETE', `/clients/${id}`)).status).toBe(403);

      // an invoice keeps it
      await own.sql(
        `INSERT INTO invoices (id, number, client_id, issue_date, due_date, status, gst_rate) VALUES ('in_x', 'INV-X-1', ?, '2026-09-01', '2026-09-15', 'Void', 0)`,
        id
      );
      const kept = await own.call('owner', 'DELETE', `/clients/${id}`);
      expect(kept.status).toBe(409);
      expect(kept.json.error.message).toMatch(/1 invoice/);
      await own.sql(`DELETE FROM invoices WHERE id = 'in_x'`);

      expect((await own.call('owner', 'DELETE', `/clients/${id}`)).status).toBe(204);
      expect((await own.call('owner', 'GET', `/clients/${id}`)).status).toBe(404);
      expect(await own.sql(`SELECT id FROM projects WHERE client_id = ?`, id)).toEqual([]);
      expect(await own.sql(`SELECT id FROM contacts WHERE client_id = ?`, id)).toEqual([]);
      expect(
        (await own.sql<{ action: string }>(`SELECT action FROM audit_log WHERE entity_id = ?`, id)).map(
          r => r.action
        )
      ).toContain('client.delete');
    } finally {
      await own.dispose();
    }
  });
});
