import { SECRET_FIELD_KEYS, type ProjectView } from '@dsol/shared';
import { describe, expect, it } from 'vitest';
import { apiPathToForm, emptyProjectForm, formToSave, viewToForm } from './formMapping';
import { projectFormSchema } from './schema';

const filled = () => {
  const f = emptyProjectForm('cl_1');
  f.project.name = 'Kaveri Storefront';
  f.sheet.links.prod = 'https://kaverinaturals.in';
  f.sheet.domain.name = 'kaverinaturals.in';
  f.sheet.domain.cost = '799';
  f.sheet.domain.renewal = '899.50';
  f.sheet.hosting.cost = '';
  return f;
};

describe('project form → API', () => {
  it('converts rupees to paise and blanks to null', () => {
    const { body } = formToSave(filled());
    expect(body.sheet.domain).toMatchObject({
      name: 'kaverinaturals.in',
      cost: 79900,
      renewal: 89950,
      expiry: null,
      auto: 'Off'
    });
    expect(body.sheet.hosting.cost).toBeNull();
    expect(body.project).toMatchObject({ clientId: 'cl_1', stack: null, environments: ['STG', 'PROD'] });
  });

  it('sends only secrets that were typed, cleared ones as ""', () => {
    const f = filled();
    f.secrets.db!.password = { stored: false, mode: 'replace', value: 'pw' };
    f.secrets.keys!.paySecret = { stored: true, mode: 'keep', value: '' };
    f.secrets.domain!.password = { stored: true, mode: 'clear', value: '' };
    f.secrets.hosting!.password = { stored: true, mode: 'replace', value: '' }; // clicked Replace, typed nothing
    expect(formToSave(f).body.secrets).toEqual({ 'db.password': 'pw', 'domain.password': '' });
  });

  it('drops blank rows and keeps a stored secret key unchanged unless replaced', () => {
    const f = filled();
    f.extraKeys = [
      { label: '', isSecret: false, value: '', storedSecret: false, replace: false },
      { id: 'xk_1', label: 'Algolia admin', isSecret: true, value: '', storedSecret: true, replace: false },
      { label: 'App ID', isSecret: false, value: 'ABC', storedSecret: false, replace: false }
    ];
    f.costs = [
      { name: '', amount: '', cycle: 'Monthly', nextDue: '' },
      { name: 'Cloudflare Pro', amount: '1700', cycle: 'Monthly', nextDue: '2026-10-28' }
    ];
    const { body, extraIndex, costIndex } = formToSave(f);
    expect(body.extraKeys).toEqual([
      { id: 'xk_1', label: 'Algolia admin', isSecret: true, value: undefined },
      { label: 'App ID', isSecret: false, value: 'ABC' }
    ]);
    expect(body.costs).toEqual([
      { name: 'Cloudflare Pro', amountPaise: 170000, cycle: 'Monthly', nextDue: '2026-10-28' }
    ]);
    expect(extraIndex).toEqual([1, 2]);
    expect(costIndex).toEqual([1]);
    // server errors on body row 0 land on form row 1
    expect(apiPathToForm('extraKeys.0.value', extraIndex, costIndex)).toBe('extraKeys.1.value');
    expect(apiPathToForm('costs.0.amountPaise', extraIndex, costIndex)).toBe('costs.1.amount');
    expect(apiPathToForm('secrets.db.password', extraIndex, costIndex)).toBe('secrets.db.password.value');
  });
});

describe('project form validation', () => {
  it('uses the prototype messages on the right fields', () => {
    const f = filled();
    f.project.name = 'ab';
    f.project.clientId = '';
    f.project.environments = [];
    f.sheet.links.prod = 'kaverinaturals.in';
    f.sheet.domain.cost = '-1';
    f.costs = [{ name: '', amount: '100', cycle: 'Monthly', nextDue: '' }];
    const r = projectFormSchema.safeParse(f);
    expect(r.success).toBe(false);
    const errors = Object.fromEntries(r.error!.issues.map(i => [i.path.join('.'), i.message]));
    expect(errors).toMatchObject({
      'project.name': 'Enter a project name (min. 3 characters).',
      'project.clientId': 'Select a client.',
      'project.environments': 'Select at least one environment.',
      'sheet.links.prod': 'URL must start with http:// or https://',
      'sheet.domain.cost': 'Amount cannot be negative.',
      'costs.0.name': 'Name this cost.'
    });
  });

  it('accepts a filled form', () => {
    expect(projectFormSchema.safeParse(filled()).success).toBe(true);
  });
});

describe('API → form', () => {
  it('shows money in rupees, never loads secret values', () => {
    const view = {
      project: {
        id: 'pj_1',
        clientId: 'cl_1',
        name: 'P',
        type: null,
        status: 'Active',
        startDate: null,
        stack: null,
        environments: ['PROD'],
        archivedAt: null,
        createdAt: '',
        updatedAt: ''
      },
      client: { id: 'cl_1', name: 'C', color: '#000000', logoUrl: null, archivedAt: null },
      sheet: { ...formToSave(filled()).body.sheet, projectId: 'pj_1', updatedAt: '' },
      secrets: Object.fromEntries(
        SECRET_FIELD_KEYS.map(k => [k, { set: k === 'db.password', updatedAt: null }])
      ),
      extraKeys: [
        {
          id: 'xk',
          projectId: 'pj_1',
          label: 'Key',
          isSecret: true,
          value: null,
          hasValue: true,
          sortOrder: 0,
          createdAt: '',
          updatedAt: ''
        }
      ],
      costs: [],
      annualCostPaise: 0
    } as unknown as ProjectView;
    const f = viewToForm(view);
    expect(f.sheet.domain.cost).toBe('799');
    expect(f.sheet.domain.renewal).toBe('899.5');
    expect(f.secrets.db!.password).toEqual({ stored: true, mode: 'keep', value: '' });
    expect(f.secrets.db!.conn).toEqual({ stored: false, mode: 'replace', value: '' });
    expect(f.extraKeys[0]).toMatchObject({ storedSecret: true, value: '' });
  });
});
