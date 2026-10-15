/**
 * Reusable emails. {{client}}, {{contact}}, {{project}} and {{version}} are filled in on compose;
 * [bracketed] placeholders must be replaced by hand before sending.
 */
import { z } from 'zod';
import { id, requiredText, timestamps } from './common';

export const emailTemplateSchema = z.object({
  id,
  name: requiredText('Name the template.', 120),
  subject: requiredText('Subject is required.', 200),
  bodyHtml: requiredText('Template body is empty.', 100_000),
  ...timestamps
});

export const emailTemplateCreateSchema = emailTemplateSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export const emailTemplateUpdateSchema = emailTemplateCreateSchema.partial();

export type EmailTemplate = z.infer<typeof emailTemplateSchema>;
export type EmailTemplateCreate = z.infer<typeof emailTemplateCreateSchema>;
export type EmailTemplateUpdate = z.infer<typeof emailTemplateUpdateSchema>;

export interface EmailTemplateView extends EmailTemplate {
  /** {{variables}} used in subject + body */
  variables: string[];
}
