/**
 * Secret project-sheet fields (passwords, secret keys, connection strings).
 *
 * Stored only as AES-GCM ciphertext in project_secrets. The API never returns ciphertext or
 * plaintext in normal responses: clients see `ProjectSecretStatus` (is it set, when, by whom),
 * and get a value only from the reveal endpoint, which checks the role and writes an audit entry.
 */
import { z } from 'zod';
import { id, isoDateTime, timestamps } from './common';
import { SECRET_FIELD_KEYS } from './projectSheet';

export const secretFieldKey = z.enum(SECRET_FIELD_KEYS);

const secretValue = z.string().min(1, 'Enter a value.').max(4000, 'Secrets are limited to 4,000 characters.');

/** The stored row — server-side only, never sent to the browser. */
export const projectSecretSchema = z.object({
  projectId: id,
  fieldKey: secretFieldKey,
  ciphertext: z.string().min(1),
  iv: z.string().min(1),
  updatedBy: id.nullable(),
  ...timestamps
});

/** What the browser sees for each secret field — never the value. */
export const secretStateSchema = z.object({
  set: z.boolean(),
  updatedAt: isoDateTime.nullable()
});

/** Every secret field of a project → its state. */
export const projectSecretStatesSchema = z.record(secretFieldKey, secretStateSchema);

/** Set a secret. */
export const projectSecretCreateSchema = z.object({ fieldKey: secretFieldKey, value: secretValue });

/** Replace a secret's value. (To clear one, DELETE it.) */
export const projectSecretUpdateSchema = z.object({ value: secretValue });

/**
 * Secrets sent with the project form: a key that is absent stays unchanged,
 * a string replaces the value, null clears it.
 */
export const projectSecretsPatchSchema = z.partialRecord(secretFieldKey, secretValue.nullable());

/**
 * POST /api/projects/:id/secrets/reveal — a sheet secret ("db.password") or a secret
 * other key ("extra:<id>").
 */
export const secretRevealRequestSchema = z.object({
  field: z.union([secretFieldKey, z.string().regex(/^extra:[\w-]{1,64}$/, 'Unknown secret field.')])
});

/** Response of the reveal endpoint. */
export const secretRevealSchema = z.object({ value: z.string() });

export type ProjectSecret = z.infer<typeof projectSecretSchema>;
export type SecretState = z.infer<typeof secretStateSchema>;
export type ProjectSecretStates = z.infer<typeof projectSecretStatesSchema>;
export type ProjectSecretCreate = z.infer<typeof projectSecretCreateSchema>;
export type ProjectSecretUpdate = z.infer<typeof projectSecretUpdateSchema>;
export type ProjectSecretsPatch = z.infer<typeof projectSecretsPatchSchema>;
export type SecretReveal = z.infer<typeof secretRevealSchema>;
export type SecretRevealRequest = z.infer<typeof secretRevealRequestSchema>;
