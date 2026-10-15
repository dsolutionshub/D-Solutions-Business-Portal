/**
 * Field rules reused by every entity schema. Messages are the ones the prototype shows.
 * Optional text fields are `null` when empty (forms turn '' into null before sending).
 */
import { z } from 'zod';
import { GST_RATES } from '../constants';
import { isIsoDate, todayIso } from '../dates';

export const id = z.string().min(1).max(64);

export const isoDate = z.string().refine(isIsoDate, 'Enter a valid date (YYYY-MM-DD).');
export const isoDateTime = z.iso.datetime({ offset: true });

/** Integer paise, never negative. */
export const paise = z
  .number({ error: 'Enter an amount.' })
  .int('Amounts are in whole paise.')
  .min(0, 'Amount cannot be negative.');

/** At least ₹0.01 — for payments. */
export const positivePaise = paise.min(1, 'Enter an amount greater than zero.');

export const httpUrl = z
  .string()
  .trim()
  .regex(/^https?:\/\/\S+\.\S{2,}/, 'URL must start with http:// or https://');

export const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.'));

/** At least 10 digits; spaces, + and dashes allowed. */
export const phone = z
  .string()
  .trim()
  .refine(v => v.replace(/\D/g, '').length >= 10, 'Enter at least 10 digits.');

export const pinCode = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'PIN codes have 6 digits.');

/** Indian GST number, e.g. 29AAKCK1234F1Z5 (upper-cased). */
export const gstin = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/,
    'Enter a valid 15-character GST number, e.g. 29AAKCK1234F1Z5.'
  );

export const domainName = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/, 'Enter a domain like example.com');

/** v1.2.0, 2.4.1 or v1.0.0-beta.1 — saved with a leading "v". */
export const version = z
  .string()
  .trim()
  .regex(/^v?\d+\.\d+\.\d+(-[\w.]+)?$/, 'Use a version like v1.2.0')
  .overwrite(v => (v.startsWith('v') ? v : 'v' + v));

export const gstRate = z.literal([...GST_RATES], { error: 'GST must be 0, 5, 12, 18 or 28%.' });

export const percent = z.number().int().min(0).max(100);

/** Trimmed text with a length cap. */
export const text = (max = 200) => z.string().trim().max(max, `Keep it under ${max} characters.`);
/** Required trimmed text. */
export const requiredText = (message: string, max = 200) => text(max).min(1, message);
/** Optional text: null when empty. */
export const optionalText = (max = 200) => text(max).nullable();

/** A date that is today or earlier (IST). */
export const pastOrToday = isoDate.refine(v => v <= todayIso(), 'Date cannot be in the future.');

export const timestamps = {
  createdAt: isoDateTime,
  updatedAt: isoDateTime
};

/** Every list endpoint returns { items }. */
export const listOf = <T extends z.ZodType>(item: T) => z.object({ items: z.array(item) });
