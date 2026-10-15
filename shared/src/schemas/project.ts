import { z } from 'zod';
import { BILLING_CYCLES, PROJECT_STATUSES } from '../constants';
import { listQuerySchema, paginatedSchema } from './api';
import { id, isoDate, isoDateTime, optionalText, paise, requiredText, timestamps } from './common';
import { extraKeySchema } from './extraKey';
import { projectCostSchema } from './projectCost';
import { projectSecretStatesSchema, secretFieldKey } from './projectSecret';
import { projectSheetCreateSchema, projectSheetSchema } from './projectSheet';

/** Project basics. Everything about the running store is in the project sheet (projectSheet.ts). */
const projectFields = {
  clientId: z.string().min(1, 'Select a client.').max(64),
  name: requiredText('Enter a project name (min. 3 characters).', 120).min(
    3,
    'Enter a project name (min. 3 characters).'
  ),
  /** From Settings → Dropdown lists → Project types. */
  type: optionalText(80),
  status: z.enum(PROJECT_STATUSES),
  startDate: isoDate.nullable(),
  stack: optionalText(200),
  /** Environment codes from Settings → Dropdown lists → Environments, e.g. ["STG", "PROD"]. */
  environments: z
    .array(
      z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z0-9-]{1,12}$/, 'Use a short code like UAT.')
    )
    .min(1, 'Select at least one environment.')
};

export const projectSchema = z.object({
  id,
  ...projectFields,
  archivedAt: isoDateTime.nullable(),
  ...timestamps
});

export const projectCreateSchema = z.object(projectFields);
export const projectUpdateSchema = projectCreateSchema.partial();

/* ---------------------------------------------------- project form (save) */

/**
 * An "other key" row on the project form.
 *   value undefined → unchanged (only for an existing secret key); a string → set it.
 *   Switching a key from secret to plain needs the value typed again.
 */
export const extraKeyInputSchema = z.object({
  id: id.optional(),
  label: requiredText('Name this key.', 120),
  isSecret: z.boolean(),
  value: z.string().max(4000).optional()
});

/** A recurring-cost row on the project form. */
export const projectCostInputSchema = z.object({
  id: id.optional(),
  name: requiredText('Name this cost.', 120),
  amountPaise: paise,
  cycle: z.enum(BILLING_CYCLES),
  nextDue: isoDate.nullable()
});

/**
 * Body of POST /api/projects and PATCH /api/projects/:id — the whole project form.
 *
 * secrets: a field that is omitted stays unchanged, "" clears it, any other value is encrypted.
 * extraKeys / costs: the full list; rows missing from it are deleted.
 */
export const projectSaveSchema = z.object({
  project: projectCreateSchema,
  sheet: projectSheetCreateSchema,
  secrets: z
    .partialRecord(secretFieldKey, z.string().max(4000, 'Secrets are limited to 4,000 characters.'))
    .default({}),
  extraKeys: z.array(extraKeyInputSchema).max(50).default([]),
  costs: z.array(projectCostInputSchema).max(50).default([])
});

/* ----------------------------------------------------------------- reads */

/** Project page (GET /api/projects/:id). Secrets come back only as { set }. */
export const projectViewSchema = z.object({
  /**
   * full: the whole sheet. costs: Accounts users — only cost amounts and due dates; URLs, logins,
   * keys and database details are blanked by the server.
   */
  access: z.enum(['full', 'costs']),
  project: projectSchema,
  client: z.object({
    id,
    name: z.string(),
    color: z.string(),
    logoUrl: z.string().nullable(),
    archivedAt: isoDateTime.nullable()
  }),
  sheet: projectSheetSchema,
  secrets: projectSecretStatesSchema,
  extraKeys: z.array(extraKeySchema),
  costs: z.array(projectCostSchema),
  /** Domain + SSL + hosting + other costs, per year. */
  annualCostPaise: paise
});

/** Projects list row (GET /api/projects). URL, domain name and database are null for roles without the sheet (Accounts). */
export const projectListItemSchema = z.object({
  id,
  name: z.string(),
  clientId: id,
  clientName: z.string(),
  clientColor: z.string(),
  clientLogoUrl: z.string().nullable(),
  type: z.string().nullable(),
  status: z.enum(PROJECT_STATUSES),
  stack: z.string().nullable(),
  environments: z.array(z.string()),
  archivedAt: isoDateTime.nullable(),
  prodUrl: z.string().nullable(),
  domainName: z.string().nullable(),
  domainExpiry: isoDate.nullable(),
  hostingPlatform: z.string().nullable(),
  hostingCostPaise: z.number().int().nullable(),
  hostingCycle: z.enum(BILLING_CYCLES).nullable(),
  dbEngine: z.string().nullable()
});

export const PROJECT_SORTS = ['name', 'client', 'domainExpiry', 'status'] as const;

export const projectListQuerySchema = listQuerySchema.extend({
  client: id.optional(),
  /** "all" = every project. */
  status: z.enum(['all', ...PROJECT_STATUSES]).default('all'),
  type: z.string().trim().max(80).optional()
});

export const projectListResponseSchema = paginatedSchema(projectListItemSchema);

export type Project = z.infer<typeof projectSchema>;
export type ProjectCreate = z.infer<typeof projectCreateSchema>;
export type ProjectUpdate = z.infer<typeof projectUpdateSchema>;
export type ExtraKeyInput = z.infer<typeof extraKeyInputSchema>;
export type ProjectCostInput = z.infer<typeof projectCostInputSchema>;
export type ProjectSave = z.infer<typeof projectSaveSchema>;
export type ProjectSaveInput = z.input<typeof projectSaveSchema>;
export type ProjectView = z.infer<typeof projectViewSchema>;
export type ProjectListItem = z.infer<typeof projectListItemSchema>;
export type ProjectListQuery = z.input<typeof projectListQuerySchema>;
export type ProjectListResponse = z.infer<typeof projectListResponseSchema>;
