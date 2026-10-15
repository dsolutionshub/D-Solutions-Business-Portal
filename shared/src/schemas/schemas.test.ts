import { describe, expect, it } from 'vitest';
import prototypeSections from './__fixtures__/prototype-sheet-sections.json';
import { clientCreateSchema } from './client';
import { gstRate, httpUrl, paise, phone, pinCode, version } from './common';
import { invoiceCreateSchema } from './invoice';
import { listValueCreateSchema } from './list';
import { releaseCreateSchema } from './release';
import { workItemCreateSchema } from './workItem';
import {
  SECRET_FIELD_KEYS,
  SHEET_SECTIONS,
  sheetDbSchema,
  sheetDomainSchema,
  sheetHostingSchema,
  sheetKeysSchema,
  sheetLinksSchema
} from './projectSheet';

const ok = (s: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) => s.safeParse(v).success;

describe('project sheet fields', () => {
  it('match the prototype sheet-fields.js exactly (keys, labels, types, options, order)', () => {
    // Convert to the prototype's tuple form: [key, label, type, options?]
    const ours = SHEET_SECTIONS.map(s => ({
      key: s.key,
      title: s.title,
      desc: s.desc,
      fields: s.fields.map(f => {
        const opt = {
          ...('required' in f && f.required ? { req: true } : {}),
          ...('vault' in f && f.vault ? { vault: true } : {}),
          ...('list' in f ? { list: f.list } : {}),
          ...('options' in f ? { options: [...f.options] } : {})
        };
        return Object.keys(opt).length ? [f.key, f.label, f.type, opt] : [f.key, f.label, f.type];
      })
    }));
    expect(ours).toEqual(prototypeSections);
  });

  it('every non-secret field has a schema key, and secret fields are not in the schema', () => {
    const shapes = {
      links: sheetLinksSchema,
      domain: sheetDomainSchema,
      hosting: sheetHostingSchema,
      db: sheetDbSchema,
      keys: sheetKeysSchema
    };
    const secrets: string[] = [];
    for (const s of SHEET_SECTIONS) {
      const plain = s.fields.filter(f => f.type !== 'secret').map(f => f.key);
      secrets.push(...s.fields.filter(f => f.type === 'secret').map(f => `${s.key}.${f.key}`));
      expect(Object.keys(shapes[s.key].shape)).toEqual(plain);
    }
    expect(secrets).toEqual([...SECRET_FIELD_KEYS]);
  });

  it('requires an http(s) production URL and a valid domain', () => {
    const links = {
      prod: 'https://shop.example.com',
      staging: null,
      dev: null,
      admin: null,
      api: null,
      apiStaging: null,
      repo: null
    };
    expect(ok(sheetLinksSchema, links)).toBe(true);
    expect(ok(sheetLinksSchema, { ...links, prod: 'shop.example.com' })).toBe(false);
    expect(ok(sheetDomainSchema.shape.name, 'kaverinaturals.in')).toBe(true);
    expect(ok(sheetDomainSchema.shape.name, 'not a domain')).toBe(false);
  });
});

describe('field rules from the prototype', () => {
  it('PIN codes have 6 digits', () => {
    expect(ok(pinCode, '560001')).toBe(true);
    expect(ok(pinCode, '56001')).toBe(false);
    expect(ok(pinCode, '5600012')).toBe(false);
  });
  it('phones need at least 10 digits', () => {
    expect(ok(phone, '+91 98450 12345')).toBe(true);
    expect(ok(phone, '98450 123')).toBe(false);
  });
  it('URLs must start with http(s)', () => {
    expect(ok(httpUrl, 'https://kaverinaturals.in')).toBe(true);
    expect(ok(httpUrl, 'http://a.co')).toBe(true);
    expect(ok(httpUrl, 'kaverinaturals.in')).toBe(false);
    expect(ok(httpUrl, 'ftp://files.example.com')).toBe(false);
  });
  it('versions look like v1.2.0 and are saved with a leading v', () => {
    expect(version.parse('1.2.0')).toBe('v1.2.0');
    expect(version.parse('v2.14.1')).toBe('v2.14.1');
    expect(ok(version, 'v1.0.0-beta.1')).toBe(true);
    expect(ok(version, 'v1.2')).toBe(false);
  });
  it('amounts are whole paise and never negative', () => {
    expect(ok(paise, 0)).toBe(true);
    expect(ok(paise, 150000)).toBe(true);
    expect(ok(paise, -1)).toBe(false);
    expect(ok(paise, 10.5)).toBe(false);
  });
  it('GST is one of 0/5/12/18/28', () => {
    for (const r of [0, 5, 12, 18, 28]) expect(ok(gstRate, r)).toBe(true);
    expect(ok(gstRate, 15)).toBe(false);
  });
});

describe('entity schemas', () => {
  const client = {
    name: 'Kaveri Naturals',
    type: 'D2C brand',
    industry: 'Food & wellness',
    website: 'https://kaverinaturals.in',
    since: '2023-03-14',
    description: null,
    addr1: '2nd Floor, 14 Lavelle Road',
    addr2: null,
    city: 'Bengaluru',
    state: 'Karnataka',
    pin: '560001',
    gstin: '29aakck1234f1z5',
    currency: 'INR',
    paymentTerms: 'Net 15',
    billingAddress: null,
    notes: null,
    status: 'Active',
    primaryContact: {
      name: 'Ananya Rao',
      role: 'Founder & CEO',
      email: 'Ananya@Kaverinaturals.in',
      phone: '+91 98450 12345',
      altPhone: null
    }
  };

  it('client: website optional but a real link; GSTIN upper-cased; email lower-cased', () => {
    const parsed = clientCreateSchema.parse(client);
    expect(parsed.gstin).toBe('29AAKCK1234F1Z5');
    expect(parsed.primaryContact.email).toBe('ananya@kaverinaturals.in');
    expect(ok(clientCreateSchema, { ...client, website: '' })).toBe(true);
    expect(ok(clientCreateSchema, { ...client, website: 'not a link' })).toBe(false);
    const { website: _w, ...noWebsite } = client;
    expect(clientCreateSchema.parse(noWebsite).website).toBe('');
    expect(ok(clientCreateSchema, { ...client, pin: '5600' })).toBe(false);
  });

  it('release: needs at least one feature or fix', () => {
    const r = {
      projectId: 'pj_p1',
      version: '4.3.0',
      environment: 'PROD',
      releaseDate: '2026-10-12',
      status: 'Scheduled',
      releasedBy: null,
      features: [],
      fixes: [],
      issues: ['Known thing']
    };
    expect(ok(releaseCreateSchema, r)).toBe(false);
    expect(releaseCreateSchema.parse({ ...r, fixes: ['A fix'] }).version).toBe('v4.3.0');
  });

  it('work item: hourly work needs hours and a rate', () => {
    const w = {
      projectId: 'pj_p1',
      releaseId: null,
      type: 'Bug fix',
      title: 'Fix COD duplicate order',
      deliveredOn: '2026-10-07',
      billing: 'Hourly',
      amountPaise: 0,
      hours: 0,
      ratePaise: 150000,
      note: null
    };
    expect(ok(workItemCreateSchema, w)).toBe(false);
    expect(ok(workItemCreateSchema, { ...w, hours: 3 })).toBe(true);
  });

  it('invoice: drafts may be incomplete, issued invoices may not; due ≥ issue date', () => {
    const inv = {
      number: 'INV-2026-0149',
      clientId: 'cl_kaveri',
      projectId: null,
      issueDate: '2026-10-12',
      dueDate: '2026-10-27',
      discountPct: 0,
      gstRate: 18,
      notes: null,
      paymentInstructions: null,
      terms: null,
      status: 'Draft',
      lines: [{ description: '', quantity: 1, unitPricePaise: 0, workItemId: null }]
    };
    expect(ok(invoiceCreateSchema, inv)).toBe(true);
    expect(ok(invoiceCreateSchema, { ...inv, status: 'Sent' })).toBe(false);
    expect(ok(invoiceCreateSchema, { ...inv, dueDate: '2026-10-01' })).toBe(false);
  });

  it('list values: environment codes are normalised', () => {
    expect(listValueCreateSchema.parse({ listKey: 'environments', value: 'u a t' }).value).toBe('UAT');
    expect(listValueCreateSchema.parse({ listKey: 'industry', value: 'Pet supplies' }).value).toBe(
      'Pet supplies'
    );
  });
});
