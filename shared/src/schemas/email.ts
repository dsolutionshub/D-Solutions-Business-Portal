import { z } from 'zod';
import { EMAIL_KINDS, EMAIL_STATUSES } from '../constants';
import { htmlToText } from '../render/sanitize';
import { unresolvedVariables } from '../render/template';
import { listQuerySchema } from './api';
import { email, id, isoDateTime, optionalText, requiredText, timestamps } from './common';

/** An email sent (or scheduled, or logged in dev) through Brevo by the Worker. */
export const emailSchema = z.object({
  id,
  /** null for staff digests */
  clientId: id.nullable(),
  kind: z.enum(EMAIL_KINDS),
  toAddresses: z.array(email).min(1, 'Choose at least one recipient.'),
  ccAddresses: z.array(email),
  /** Display text, e.g. "Rohan Mehta, Sneha Kulkarni". */
  toText: z.string().max(1000),
  recipientCount: z.number().int().min(0),
  subject: requiredText('Subject is required.', 200),
  templateName: optionalText(120),
  bodyHtml: z.string().max(100_000).nullable(),
  status: z.enum(EMAIL_STATUSES),
  /** When it was sent, or when it is scheduled to go. */
  sendAt: isoDateTime.nullable(),
  releaseId: id.nullable(),
  invoiceId: id.nullable(),
  paymentId: id.nullable(),
  attachmentCount: z.number().int().min(0),
  providerMessageId: z.string().nullable(),
  error: z.string().nullable(),
  ...timestamps
});

/** Invoices and receipts go as a link to their printable page, not as a file. */
export const emailAttachmentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('invoice'), invoiceNo: z.string().min(1).max(40) }),
  z.object({ kind: z.literal('receipt'), paymentId: id })
]);

/** Hand-filled [placeholders] from the prototype's templates, e.g. [time window]. */
const BRACKET = /\[(date|time window|domain|amount|invoice no\.|due date|Your announcement)\]/;

const recipients = z.array(email).max(50, 'Send to at most 50 addresses at once.');

/** POST /api/emails/send — send now, or schedule (`scheduledAt` in the future). */
export const emailSendSchema = z
  .object({
    clientId: id,
    to: recipients.min(1, 'Choose at least one recipient.'),
    cc: recipients.default([]),
    subject: requiredText('Subject is required.', 200),
    html: z
      .string()
      .max(100_000)
      .refine(v => htmlToText(v).length > 0, 'Message body is empty.'),
    template: optionalText(120).optional(),
    scheduledAt: isoDateTime.nullable().optional(),
    attachments: z.array(emailAttachmentSchema).max(5).default([]),
    releaseId: id.nullable().optional()
  })
  .superRefine((v, ctx) => {
    const left = unresolvedVariables(v.subject, v.html);
    if (left.length)
      ctx.addIssue({
        code: 'custom',
        path: ['html'],
        message: `Fill in or remove ${left.map(n => `{{${n}}}`).join(', ')} before sending.`
      });
    if (BRACKET.test(v.subject + v.html))
      ctx.addIssue({ code: 'custom', path: ['html'], message: 'Replace the [placeholders] before sending.' });
    if (v.scheduledAt && Date.parse(v.scheduledAt) <= Date.now())
      ctx.addIssue({ code: 'custom', path: ['scheduledAt'], message: 'Pick a time in the future.' });
  });

export const emailListQuerySchema = listQuerySchema.extend({
  client: id.optional(),
  status: z.enum(EMAIL_STATUSES).optional(),
  kind: z.enum(EMAIL_KINDS).optional(),
  template: z.string().max(120).optional()
});

/** Which step-4 action the compose dialog is prefilled for. */
export const emailPrefillQuerySchema = z.discriminatedUnion('for', [
  z.object({ for: z.literal('invoice'), invoice: z.string().min(1).max(40) }),
  z.object({ for: z.literal('reminder'), invoice: z.string().min(1).max(40) }),
  z.object({ for: z.literal('receipt'), payment: id }),
  z.object({ for: z.literal('release'), release: id })
]);

export type Email = z.infer<typeof emailSchema>;
export type EmailAttachment = z.infer<typeof emailAttachmentSchema>;
export type EmailSend = z.input<typeof emailSendSchema>;
export type EmailListQuery = z.input<typeof emailListQuerySchema>;
export type EmailPrefillQuery = z.infer<typeof emailPrefillQuerySchema>;

export interface EmailView extends Email {
  clientName: string | null;
  sentByName: string | null;
  invoiceNo: string | null;
}

export interface EmailListResponse {
  items: EmailView[];
  total: number;
  page: number;
  pageSize: number;
  /** across all emails (not just this page / filter) */
  stats: { sent: number; scheduled: number; failed: number; logged: number };
}

export interface EmailRecipient {
  name: string;
  email: string;
  tag: string;
  notifyReleases: boolean;
}

/** GET /api/emails/prefill — a ready-to-send email for a step-4 action, editable before sending. */
export interface EmailPrefill {
  clientId: string;
  clientName: string;
  /** all of the client's contacts, for the recipient picker */
  contacts: EmailRecipient[];
  to: string[];
  cc: string[];
  subject: string;
  html: string;
  template: string;
  attachments: EmailAttachment[];
  releaseId: string | null;
  /** variables that couldn't be filled (left as {{name}}) */
  missing: string[];
  unknown: string[];
  /** e.g. "No contacts have release emails enabled — turn it on in the client’s Contacts tab." */
  warning: string | null;
}

/** POST /api/emails/send result */
export interface EmailSendResult {
  email: EmailView;
  /** "Sent", "Scheduled", "Logged (dev)" or "Failed" */
  status: Email['status'];
}
