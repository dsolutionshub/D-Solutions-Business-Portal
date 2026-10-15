import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ApiError } from './api';

/** '' (and whitespace) → null, so optional inputs validate against the shared nullable schemas. */
export const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

/** Wrap a shared schema for a text input: empty means null. */
export const optional = <T extends z.ZodType>(schema: T) => z.preprocess(blankToNull, schema);

/**
 * After a failed save: put the server's field errors on the form fields and show a toast.
 * `mapPath` renames API paths to form paths (e.g. "primaryContact.email" → "email").
 * Returns true when at least one field error was shown.
 */
export function applyServerErrors<T extends FieldValues>(
  err: unknown,
  setError: UseFormSetError<T>,
  mapPath: (apiPath: string) => string | null = p => p
): boolean {
  const message = err instanceof Error ? err.message : 'Something went wrong.';
  let shown = false;
  if (err instanceof ApiError && err.fields) {
    let first = true;
    for (const [apiPath, msg] of Object.entries(err.fields)) {
      const path = mapPath(apiPath);
      if (!path) continue;
      setError(path as Path<T>, { type: 'server', message: msg }, { shouldFocus: first });
      first = false;
      shown = true;
    }
  }
  toast.error(shown ? 'Please fix the highlighted fields.' : message);
  return shown;
}

/** Shown when the browser-side validation finds problems (before anything is sent). */
export const onInvalid = () => toast.error('Please fix the highlighted fields.');
