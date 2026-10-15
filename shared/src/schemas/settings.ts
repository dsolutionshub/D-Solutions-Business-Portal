/** Company profile, invoicing defaults, email sender and reminder preferences — a single row. */
import { z } from 'zod';
import {
  ALERT_TYPES,
  DEFAULT_NOTIFICATION_PREFS,
  REMINDER_DAY_OPTIONS,
  type AlertType,
  type AlertTypePrefs
} from '../constants';
import { email, isoDateTime, optionalText, paise, requiredText } from './common';

const reminderDays = z
  .array(
    z
      .number()
      .int()
      .refine(d => (REMINDER_DAY_OPTIONS as readonly number[]).includes(d), {
        message: `Pick from ${REMINDER_DAY_OPTIONS.join(', ')} days.`
      })
  )
  .transform(days => [...new Set(days)].sort((a, b) => b - a));

export const alertTypePrefsSchema = z.object({ days: reminderDays, email: z.boolean(), inApp: z.boolean() });

/**
 * Reminder days and channels per alert type. An empty day list turns the type off.
 * Older rows stored only the day list per type; those read as "email and in-app on", and
 * missing types get the defaults.
 */
export const notificationPrefsSchema = z.preprocess(
  raw => {
    const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    return Object.fromEntries(
      ALERT_TYPES.map(t => {
        const v = src[t];
        if (Array.isArray(v)) return [t, { days: v, email: true, inApp: true }];
        return [t, v ?? DEFAULT_NOTIFICATION_PREFS[t]];
      })
    );
  },
  z.record(z.enum(ALERT_TYPES), alertTypePrefsSchema)
) as unknown as z.ZodType<Record<AlertType, AlertTypePrefs>, unknown>;

/** PATCH /api/notification-prefs: any subset of types. */
export const notificationPrefsUpdateSchema = z.partialRecord(z.enum(ALERT_TYPES), alertTypePrefsSchema);

const settingsFields = {
  company: requiredText('Company name is required.', 120),
  address: optionalText(500),
  gstin: optionalText(15),
  /** Shown on invoices under "Payment instructions". */
  bank: optionalText(300),
  upi: optionalText(80),
  invoicePrefix: requiredText('Prefix is required.', 20),
  nextInvoiceNo: z.number().int().min(1, 'Enter a positive number.'),
  /** Default rate for hourly fixes and support. */
  hourlyRatePaise: paise,
  notificationPrefs: notificationPrefsSchema,
  /** Sender shown on emails; falls back to the EMAIL_FROM_* Worker variables. */
  emailFromName: optionalText(80),
  emailFromAddress: email.nullable(),
  timezone: z.string().min(1).max(60).refine(isTimeZone, 'Unknown time zone.'),
  emailDailyLimit: z.number().int().min(1, 'At least 1 email a day.').max(100_000),
  clientOverdueReminders: z.boolean()
};

function isTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const settingsSchema = z.object({ ...settingsFields, updatedAt: isoDateTime });

/** There is exactly one settings row; "create" is the full set of fields. */
export const settingsCreateSchema = z.object(settingsFields);

/** PATCH /api/settings (Admin, or a role allowed to change settings). Preferences have their own endpoint. */
export const settingsUpdateSchema = settingsCreateSchema.omit({ notificationPrefs: true }).partial();

export type NotificationPrefs = Record<AlertType, AlertTypePrefs>;
export type NotificationPrefsUpdate = z.infer<typeof notificationPrefsUpdateSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type SettingsCreate = z.input<typeof settingsCreateSchema>;
export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;
