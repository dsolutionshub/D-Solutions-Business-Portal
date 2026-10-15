/** Compose helpers shared by the compose form, preview and dialogs. */
import type { EmailAttachment } from '@dsol/shared';

export interface ComposeInitial {
  clientId: string;
  to: string[];
  cc: string[];
  subject: string;
  html: string;
  template: string | null;
  attachments: EmailAttachment[];
  releaseId: string | null;
}

export const blankCompose = (clientId = ''): ComposeInitial => ({
  clientId,
  to: [],
  cc: [],
  subject: '',
  html: '',
  template: null,
  attachments: [],
  releaseId: null
});

export const attachmentLabel = (a: EmailAttachment, receiptNo?: string) =>
  a.kind === 'invoice' ? `View invoice ${a.invoiceNo}` : `View receipt${receiptNo ? ' ' + receiptNo : ''}`;
