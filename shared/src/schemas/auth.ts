/** Sign-in with portal passwords: login, forgot / reset password, change password. */
import { z } from 'zod';
import { email } from './common';

/** Common passwords people try first — refused outright (plus anything containing "password"). */
const COMMON = [
  '123456789',
  '1234567890',
  'qwertyuiop',
  'iloveyou12',
  'letmein123',
  'welcome123',
  'admin12345',
  'abcd123456'
];

/** Password policy: 10–128 characters, not a common password, not the email. */
export const newPassword = z
  .string()
  .min(10, 'Use at least 10 characters.')
  .max(128, 'Use at most 128 characters.')
  .refine(
    p => !/password/i.test(p) && !COMMON.includes(p.toLowerCase()),
    'That password is too common. Pick another.'
  )
  .refine(p => new Set(p).size >= 5, 'Use a less repetitive password.');

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password.').max(128)
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: newPassword
});

export const changePasswordSchema = z
  .object({
    current: z.string().min(1, 'Enter your current password.').max(128),
    password: newPassword
  })
  .refine(v => v.current !== v.password, {
    path: ['password'],
    message: 'Choose a different password from the current one.'
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
