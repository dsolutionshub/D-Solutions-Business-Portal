import type { ValidationTargets } from 'hono';
import { validator } from 'hono/validator';
import type { z } from 'zod';

export class ValidationError extends Error {
  constructor(public readonly issues: z.core.$ZodIssue[]) {
    super('Validation failed');
  }
}

/**
 * Validate a request part with a shared Zod schema. Handlers read the typed result with
 * `c.req.valid(target)`. Failures become a 400 with per-field issues (see errorHandler).
 */
export const validate = <T extends z.ZodType, Target extends keyof ValidationTargets>(
  target: Target,
  schema: T
) =>
  validator(target, value => {
    const result = schema.safeParse(value);
    if (!result.success) throw new ValidationError(result.error.issues);
    return result.data as z.output<T>;
  });
