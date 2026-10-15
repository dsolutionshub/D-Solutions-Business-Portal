import { z } from 'zod';
import { CONTACT_TAGS } from '../constants';
import { email, id, optionalText, phone, requiredText, timestamps } from './common';

/**
 * A person at a client. Exactly one contact per client is tagged "Primary" — that is the client's
 * primary contact shown on lists and pre-selected for emails.
 */
export const contactSchema = z.object({
  id,
  clientId: id,
  name: requiredText('Name is required.', 120),
  role: optionalText(120),
  email,
  phone: phone.nullable(),
  altPhone: phone.nullable(),
  tag: z.enum(CONTACT_TAGS),
  /** Receives release and maintenance emails. */
  notifyReleases: z.boolean(),
  ...timestamps
});

export const contactCreateSchema = contactSchema.omit({ id: true, createdAt: true, updatedAt: true });
export const contactUpdateSchema = contactCreateSchema.omit({ clientId: true }).partial();

export type Contact = z.infer<typeof contactSchema>;
export type ContactCreate = z.infer<typeof contactCreateSchema>;
export type ContactUpdate = z.infer<typeof contactUpdateSchema>;
