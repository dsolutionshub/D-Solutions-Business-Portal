/**
 * Client form ↔ API. The form is flat (as in the prototype); the API nests the primary contact.
 * Field rules come from the shared schemas so browser and server agree.
 */
import {
  CLIENT_STATUSES,
  email,
  gstin,
  httpUrl,
  isoDate,
  optionalText,
  phone,
  pinCode,
  requiredText,
  type ClientCreateInput,
  type ClientView
} from '@dsol/shared';
import { z } from 'zod';
import { optional } from '@/lib/forms';

const required = (message: string) => z.string().trim().min(1, message);

export const clientFormSchema = z.object({
  name: requiredText('Client name is required.', 120).min(2, 'Client name is required.'),
  type: optional(optionalText(80)),
  industry: optional(optionalText(80)),
  since: optional(isoDate.nullable()),
  description: optional(optionalText(500)),
  gstin: optional(gstin.nullable()),
  contact: requiredText('Primary contact is required.', 120),
  email: required('Email is required.').pipe(email),
  phone: required('Phone is required.').pipe(phone),
  altPhone: optional(phone.nullable()),
  addr1: requiredText('Address line 1 is required.'),
  addr2: optional(optionalText()),
  city: requiredText('City is required.', 80),
  state: optional(optionalText(80)),
  pin: required('PIN code is required.').pipe(pinCode),
  instagram: optional(httpUrl.nullable()),
  facebook: optional(httpUrl.nullable()),
  youtube: optional(httpUrl.nullable()),
  socialOther: optional(httpUrl.nullable()),
  notes: optional(optionalText(2000)),
  status: z.enum(CLIENT_STATUSES)
});

/** What the inputs hold (all text). */
export type ClientFormValues = {
  [K in keyof z.output<typeof clientFormSchema>]: K extends 'status' ? 'Active' | 'Inactive' : string;
};
export type ClientFormOutput = z.output<typeof clientFormSchema>;

export const emptyClientForm = (): ClientFormValues => ({
  name: '',
  type: '',
  industry: '',
  since: new Date().toISOString().slice(0, 10),
  description: '',
  gstin: '',
  contact: '',
  email: '',
  phone: '',
  altPhone: '',
  addr1: '',
  addr2: '',
  city: '',
  state: '',
  pin: '',
  instagram: '',
  facebook: '',
  youtube: '',
  socialOther: '',
  notes: '',
  status: 'Active'
});

export const clientToForm = (c: ClientView): ClientFormValues => ({
  name: c.name,
  type: c.type ?? '',
  industry: c.industry ?? '',
  since: c.since ?? '',
  description: c.description ?? '',
  gstin: c.gstin ?? '',
  contact: c.primaryContact?.name ?? '',
  email: c.primaryContact?.email ?? '',
  phone: c.primaryContact?.phone ?? '',
  altPhone: c.primaryContact?.altPhone ?? '',
  addr1: c.addr1,
  addr2: c.addr2 ?? '',
  city: c.city,
  state: c.state ?? '',
  pin: c.pin,
  instagram: c.instagram ?? '',
  facebook: c.facebook ?? '',
  youtube: c.youtube ?? '',
  socialOther: c.socialOther ?? '',
  notes: c.notes ?? '',
  status: c.status
});

export function formToApi(v: ClientFormOutput): ClientCreateInput {
  const { contact, email: mail, phone: tel, altPhone, ...client } = v;
  return {
    ...client,
    primaryContact: { name: contact, email: mail, phone: tel, altPhone }
  };
}

/** API error paths → form fields. */
export const apiPathToField = (path: string): string => {
  const contact: Record<string, string> = {
    'primaryContact.name': 'contact',
    'primaryContact.email': 'email',
    'primaryContact.phone': 'phone',
    'primaryContact.altPhone': 'altPhone'
  };
  return contact[path] ?? path;
};
