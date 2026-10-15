/**
 * Project form ↔ API (POST/PATCH /api/projects). Pure functions, unit-tested.
 *
 * The form holds text: money in rupees, empty optional fields as ''. The API takes paise and null.
 * Secrets are never loaded into the form — only whether each one is stored — and each secret
 * field has a mode: keep (leave as is), replace (type a new value) or clear.
 */
import {
  rupeesToPaise,
  SECRET_FIELD_KEYS,
  SHEET_SECTIONS,
  type ProjectSaveInput,
  type ProjectStatus,
  type ProjectView,
  type SecretFieldKey
} from '@dsol/shared';

export type SectionKey = (typeof SHEET_SECTIONS)[number]['key'];
export type SecretMode = 'keep' | 'replace' | 'clear';

export interface SecretInput {
  /** A value is stored on the server. */
  stored: boolean;
  mode: SecretMode;
  value: string;
}

export interface ExtraKeyRow {
  id?: string;
  label: string;
  isSecret: boolean;
  value: string;
  /** The server holds an encrypted value for this key. */
  storedSecret: boolean;
  /** Typing a new value for a stored secret. */
  replace: boolean;
}

export interface CostRow {
  id?: string;
  name: string;
  /** rupees, as typed */
  amount: string;
  cycle: 'Monthly' | 'Yearly';
  nextDue: string;
}

export interface ProjectFormValues {
  project: {
    clientId: string;
    name: string;
    type: string;
    status: ProjectStatus;
    startDate: string;
    /** not shown in the form any more; an existing value is kept as it is */
    stack: string;
    environments: string[];
  };
  /** Every non-secret sheet field as text, plus notes. Money in rupees. */
  sheet: Record<SectionKey, Record<string, string>> & { notes: string };
  /** secrets[section][field], e.g. secrets.db.password */
  secrets: Record<string, Record<string, SecretInput>>;
  extraKeys: ExtraKeyRow[];
  costs: CostRow[];
}

const splitKey = (k: SecretFieldKey) => k.split('.') as [string, string];
const today = () => new Date().toISOString().slice(0, 10);

export function emptyProjectForm(clientId = ''): ProjectFormValues {
  const sheet = { notes: '' } as ProjectFormValues['sheet'];
  for (const s of SHEET_SECTIONS) {
    sheet[s.key] = {};
    for (const f of s.fields) if (f.type !== 'secret') sheet[s.key][f.key] = '';
  }
  sheet.domain.auto = 'Off';
  sheet.hosting.cycle = 'Monthly';
  const secrets: ProjectFormValues['secrets'] = {};
  for (const k of SECRET_FIELD_KEYS) {
    const [s, f] = splitKey(k);
    (secrets[s] ??= {})[f] = { stored: false, mode: 'replace', value: '' };
  }
  return {
    project: {
      clientId,
      name: '',
      type: 'E-commerce storefront',
      status: 'Active',
      startDate: today(),
      stack: '',
      environments: ['STG', 'PROD']
    },
    sheet,
    secrets,
    extraKeys: [],
    costs: []
  };
}

const moneyToForm = (paise: unknown) => (typeof paise === 'number' ? String(paise / 100) : '');

export function viewToForm(v: ProjectView): ProjectFormValues {
  const form = emptyProjectForm(v.project.clientId);
  form.project = {
    clientId: v.project.clientId,
    name: v.project.name,
    type: v.project.type ?? '',
    status: v.project.status,
    startDate: v.project.startDate ?? '',
    stack: v.project.stack ?? '',
    environments: [...v.project.environments]
  };
  for (const s of SHEET_SECTIONS)
    for (const f of s.fields) {
      if (f.type === 'secret') continue;
      const value = (v.sheet[s.key] as Record<string, unknown>)[f.key];
      form.sheet[s.key][f.key] = f.type === 'money' ? moneyToForm(value) : value == null ? '' : String(value);
    }
  form.sheet.notes = v.sheet.notes ?? '';
  for (const k of SECRET_FIELD_KEYS) {
    const [s, f] = splitKey(k);
    const stored = v.secrets[k]?.set ?? false;
    form.secrets[s]![f] = { stored, mode: stored ? 'keep' : 'replace', value: '' };
  }
  form.extraKeys = v.extraKeys.map(k => ({
    id: k.id,
    label: k.label,
    isSecret: k.isSecret,
    value: k.isSecret ? '' : (k.value ?? ''),
    storedSecret: k.isSecret && k.hasValue,
    replace: false
  }));
  form.costs = v.costs.map(c => ({
    id: c.id,
    name: c.name,
    amount: moneyToForm(c.amountPaise),
    cycle: c.cycle,
    nextDue: c.nextDue ?? ''
  }));
  return form;
}

/** Form sheet (text) → API sheet shape: '' → null, rupees → paise. Used by the form's validation too. */
export function sheetToApi(sheet: ProjectFormValues['sheet']): Record<string, unknown> {
  const out: Record<string, Record<string, unknown> | string | null> = {};
  for (const s of SHEET_SECTIONS) {
    const section: Record<string, unknown> = {};
    for (const f of s.fields) {
      if (f.type === 'secret') continue;
      const raw = (sheet[s.key]?.[f.key] ?? '').trim();
      if (s.key === 'domain' && f.key === 'auto') section[f.key] = raw === 'On' ? 'On' : 'Off';
      else if (f.type === 'money') section[f.key] = raw === '' ? null : (rupeesToPaise(raw) ?? Number.NaN);
      else section[f.key] = raw === '' ? null : raw;
    }
    out[s.key] = section;
  }
  out.notes = sheet.notes.trim() || null;
  return out;
}

export const projectToApi = (p: ProjectFormValues['project']) => ({
  ...p,
  name: p.name.trim(),
  type: p.type || null,
  startDate: p.startDate || null,
  stack: p.stack.trim() || null
});

const isBlankKey = (r: ExtraKeyRow) => !r.label.trim() && !r.value && !r.storedSecret;
const isBlankCost = (r: CostRow) => !r.name.trim() && !r.amount.trim() && !r.nextDue;

/**
 * The whole form → the save body. Blank rows are dropped; `extraIndex` / `costIndex` map the
 * body's row numbers back to the form's, so server field errors land on the right row.
 */
export function formToSave(v: ProjectFormValues): {
  body: ProjectSaveInput;
  extraIndex: number[];
  costIndex: number[];
} {
  const secrets: Partial<Record<SecretFieldKey, string>> = {};
  for (const k of SECRET_FIELD_KEYS) {
    const [s, f] = splitKey(k);
    const input = v.secrets[s]?.[f];
    if (!input) continue;
    if (input.mode === 'clear' && input.stored) secrets[k] = '';
    else if (input.mode === 'replace' && input.value !== '') secrets[k] = input.value;
  }

  const extraIndex: number[] = [];
  const extraKeys = v.extraKeys.flatMap((r, i) => {
    if (isBlankKey(r)) return [];
    extraIndex.push(i);
    let value: string | undefined;
    if (r.isSecret) value = r.storedSecret && !r.replace ? undefined : r.value || undefined;
    // A stored secret turned into a plain key needs its value typed again; '' would wipe it.
    else value = r.storedSecret && r.value === '' ? undefined : r.value;
    return [{ ...(r.id ? { id: r.id } : {}), label: r.label.trim(), isSecret: r.isSecret, value }];
  });

  const costIndex: number[] = [];
  const costs = v.costs.flatMap((r, i) => {
    if (isBlankCost(r)) return [];
    costIndex.push(i);
    return [
      {
        ...(r.id ? { id: r.id } : {}),
        name: r.name.trim(),
        amountPaise: rupeesToPaise(r.amount) ?? 0,
        cycle: r.cycle,
        nextDue: r.nextDue || null
      }
    ];
  });

  return {
    body: {
      project: projectToApi(v.project) as ProjectSaveInput['project'],
      sheet: sheetToApi(v.sheet) as ProjectSaveInput['sheet'],
      secrets,
      extraKeys,
      costs
    },
    extraIndex,
    costIndex
  };
}

/** Server error path → form field path. */
export function apiPathToForm(path: string, extraIndex: number[], costIndex: number[]): string {
  const [head, a, b, ...rest] = path.split('.');
  if (head === 'secrets' && a && b) return `secrets.${a}.${b}.value`;
  if (head === 'extraKeys' && a !== undefined)
    return ['extraKeys', extraIndex[Number(a)] ?? a, b, ...rest].filter(x => x !== undefined).join('.');
  if (head === 'costs' && a !== undefined) {
    const field = b === 'amountPaise' ? 'amount' : b;
    return ['costs', costIndex[Number(a)] ?? a, field, ...rest].filter(x => x !== undefined).join('.');
  }
  return path;
}
