/** Manual notices (Upcoming maintenance / Other): shown as alerts until their date passes. */
import { z } from 'zod';
import { NOTICE_TYPES } from '../constants';
import { id, isoDate, optionalText, requiredText, timestamps } from './common';

export const noticeSchema = z.object({
  id,
  title: requiredText('Give the notice a title.', 160),
  body: optionalText(1000),
  date: isoDate,
  type: z.enum(NOTICE_TYPES),
  createdBy: id.nullable(),
  ...timestamps
});

export const noticeCreateSchema = noticeSchema.pick({ title: true, body: true, date: true, type: true });

export type Notice = z.infer<typeof noticeSchema>;
export type NoticeCreate = z.infer<typeof noticeCreateSchema>;
export interface NoticeView extends Notice {
  createdByName: string | null;
}
