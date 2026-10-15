import { nanoid } from 'nanoid';

/** Readable prefix per table, so an id says what it points to (useful in logs and URLs). */
export const ID_PREFIX = {
  user: 'us',
  role: 'ro',
  client: 'cl',
  contact: 'ct',
  project: 'pj',
  extraKey: 'xk',
  projectCost: 'pc',
  release: 'rl',
  releaseItem: 'ri',
  workItem: 'wk',
  invoice: 'in',
  invoiceLine: 'il',
  payment: 'py',
  renewal: 'rn',
  email: 'em',
  emailTemplate: 'et',
  listValue: 'lv',
  audit: 'au',
  notice: 'nt',
  cronRun: 'cr'
} as const;

export type IdKind = keyof typeof ID_PREFIX;

/** e.g. newId('client') → "cl_V1StGXR8_Z5jdHi6B" (16 random url-safe chars, ~95 bits). */
export const newId = (kind: IdKind) => `${ID_PREFIX[kind]}_${nanoid(16)}`;
