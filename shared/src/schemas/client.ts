import { z } from 'zod';
import { CLIENT_STATUSES } from '../constants';
import { listQuerySchema, paginatedSchema } from './api';
import { contactSchema } from './contact';
import {
  gstin,
  httpUrl,
  id,
  isoDate,
  isoDateTime,
  optionalText,
  pinCode,
  requiredText,
  timestamps
} from './common';

/** The client's primary contact, entered on the client form (stored as a contact tagged Primary). */
export const primaryContactInputSchema = contactSchema
  .pick({
    name: true,
    role: true,
    email: true,
    altPhone: true
  })
  .extend({
    phone: contactSchema.shape.phone.unwrap(),
    /** Not asked on the client form; set it on the Contacts tab. */
    role: contactSchema.shape.role.optional()
  });

const clientFields = {
  name: requiredText('Client name is required.', 120).min(2, 'Client name is required.'),
  /** Business type / industry / state come from Settings → Dropdown lists. */
  type: optionalText(80),
  industry: optionalText(80),
  /** Optional; '' when not given (the column is NOT NULL in the database). */
  website: z.union([httpUrl, z.literal('')]),
  since: isoDate.nullable(),
  description: optionalText(500),
  addr1: requiredText('Address line 1 is required.'),
  addr2: optionalText(),
  city: requiredText('City is required.', 80),
  state: optionalText(80),
  pin: pinCode,
  gstin: gstin.nullable(),
  currency: z.literal('INR'),
  /** e.g. "Net 15" — the number of days sets an invoice's default due date. */
  paymentTerms: requiredText('Payment terms are required.', 40),
  billingAddress: optionalText(500),
  /** Social media pages of the brand. */
  instagram: httpUrl.nullable(),
  facebook: httpUrl.nullable(),
  youtube: httpUrl.nullable(),
  /** LinkedIn, X, Pinterest… */
  socialOther: httpUrl.nullable(),
  notes: optionalText(2000),
  status: z.enum(CLIENT_STATUSES)
};

export const clientSchema = z.object({
  id,
  ...clientFields,
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  /** R2 object key of the uploaded logo. */
  logoKey: z.string().nullable(),
  archivedAt: isoDateTime.nullable(),
  ...timestamps
});

/** Fields the client form doesn't show get their usual defaults on create. */
export const clientCreateSchema = z.object({
  ...clientFields,
  gstin: clientFields.gstin.default(null),
  website: clientFields.website.default(''),
  currency: clientFields.currency.default('INR'),
  paymentTerms: clientFields.paymentTerms.default('Net 15'),
  billingAddress: clientFields.billingAddress.default(null),
  instagram: clientFields.instagram.default(null),
  facebook: clientFields.facebook.default(null),
  youtube: clientFields.youtube.default(null),
  socialOther: clientFields.socialOther.default(null),
  primaryContact: primaryContactInputSchema
});

/** Only the fields sent are changed (no defaults here, so omitted fields are never reset). */
export const clientUpdateSchema = z
  .object({ ...clientFields, primaryContact: primaryContactInputSchema })
  .partial();

/** Clients list row (GET /api/clients). */
export const clientListItemSchema = z.object({
  id,
  name: z.string(),
  color: z.string(),
  logoUrl: z.string().nullable(),
  website: z.string(),
  industry: z.string().nullable(),
  status: z.enum(CLIENT_STATUSES),
  archivedAt: isoDateTime.nullable(),
  contactName: z.string().nullable(),
  contactEmail: z.string().nullable(),
  contactPhone: z.string().nullable(),
  /** Projects that are not Completed and not archived. */
  activeProjects: z.number().int(),
  /** Next domain expiry across the client's projects (earliest upcoming, else most recent past). */
  nextDomainExpiry: isoDate.nullable(),
  nextDomainName: z.string().nullable()
});

export const CLIENT_SORTS = ['name', 'projects', 'domainExpiry', 'status'] as const;

export const clientListQuerySchema = listQuerySchema.extend({
  /** "all" = every client that is not archived. */
  status: z.enum(['all', 'Active', 'Inactive', 'Archived']).default('all'),
  industry: z.string().trim().max(80).optional()
});

export const clientListResponseSchema = paginatedSchema(clientListItemSchema).extend({
  summary: z.object({ total: z.number(), active: z.number(), inactive: z.number(), archived: z.number() }),
  /** Industries in use, for the filter. */
  industries: z.array(z.string())
});

/** Client page (GET /api/clients/:id). */
export const clientViewSchema = clientSchema.omit({ logoKey: true }).extend({
  logoUrl: z.string().nullable(),
  primaryContact: contactSchema.nullable(),
  counts: z.object({ projects: z.number(), activeProjects: z.number(), contacts: z.number() })
});

export type Client = z.infer<typeof clientSchema>;
export type ClientCreate = z.infer<typeof clientCreateSchema>;
export type ClientCreateInput = z.input<typeof clientCreateSchema>;
export type ClientUpdate = z.infer<typeof clientUpdateSchema>;
export type PrimaryContactInput = z.infer<typeof primaryContactInputSchema>;
export type ClientListItem = z.infer<typeof clientListItemSchema>;
export type ClientListQuery = z.input<typeof clientListQuerySchema>;
export type ClientListResponse = z.infer<typeof clientListResponseSchema>;
export type ClientView = z.infer<typeof clientViewSchema>;
