import type { ApiErrorBody } from '@dsol/shared';
import type { ErrorHandler, NotFoundHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../env';
import { HttpError } from './errors';
import { ValidationError } from './validate';

const body = (code: string, message: string, fields?: Record<string, string>): ApiErrorBody => ({
  error: { code, message, ...(fields && Object.keys(fields).length ? { fields } : {}) }
});

/** Zod issues → { "sheet.links.prod": "URL must start with http:// or https://" } (first message per field). */
export function issuesToFields(issues: ValidationError['issues']): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const i of issues) {
    const path = i.path.map(String).join('.') || '_';
    fields[path] ??= i.message;
  }
  return fields;
}

export const errorHandler: ErrorHandler<AppEnv> = (err, c) => {
  if (err instanceof ValidationError)
    return c.json(body('validation', 'Please fix the highlighted fields.', issuesToFields(err.issues)), 400);
  if (err instanceof HttpError) return c.json(body(err.code, err.message, err.fields), err.status);
  if (err instanceof HTTPException) return c.json(body(String(err.status), err.message), err.status);
  // A unique index caught a race the route's own check missed.
  if (err instanceof Error && /UNIQUE constraint failed/.test(err.message + String(err.cause ?? '')))
    return c.json(body('conflict', 'That already exists.'), 409);
  // Log only the message and stack — never request bodies, which may hold secrets.
  const requestId = c.get('requestId') ?? null;
  console.error(
    JSON.stringify({
      level: 'error',
      requestId,
      method: c.req.method,
      path: c.req.path,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined
    })
  );
  // details stay in the logs; the user gets a reference to quote
  return c.json(
    body(
      'internal',
      `Something went wrong. Please try again${requestId ? ` (reference ${requestId})` : ''}.`
    ),
    500
  );
};

export const notFound: NotFoundHandler<AppEnv> = c => c.json(body('not_found', 'Not found.'), 404);
