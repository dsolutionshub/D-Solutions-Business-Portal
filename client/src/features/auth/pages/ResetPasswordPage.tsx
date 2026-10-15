import { newPassword } from '@dsol/shared';
import { AlertCircle, Check, Loader2, X } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Field } from '@/components/common/Field';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { authApi } from '../api';
import { AuthLayout } from '../components/AuthLayout';
import { PasswordInput } from '../components/PasswordInput';

type Values = { password: string; confirm: string };

const RULES: [string, (p: string) => boolean][] = [
  ['At least 10 characters', p => p.length >= 10],
  ['Not a common password', p => p.length > 0 && !/password/i.test(p)],
  ['Not too repetitive', p => new Set(p).size >= 5]
];

/** Set a password from an invite link, or choose a new one from a reset link. */
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const invite = params.get('invite') === '1';
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    setError: setFieldError,
    formState
  } = useForm<Values>({ defaultValues: { password: '', confirm: '' } });
  const e = formState.errors;
  const pw = watch('password');
  const title = invite ? 'Choose your password' : 'Choose a new password';

  if (!token)
    return (
      <AuthLayout title={title}>
        <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-sm text-bad">
          This page needs the link from your email.{' '}
          <Link to="/forgot-password" className="font-medium underline">
            Ask for a new link
          </Link>
          .
        </p>
      </AuthLayout>
    );

  const submit = handleSubmit(async v => {
    setError(null);
    const p = newPassword.safeParse(v.password);
    if (!p.success) return setFieldError('password', { message: p.error.issues[0]!.message });
    if (v.password !== v.confirm) return setFieldError('confirm', { message: 'The passwords don’t match.' });
    setBusy(true);
    try {
      await authApi.reset({ token, password: v.password });
      navigate('/login?reset=1', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.fields?.password)
        setFieldError('password', { message: err.fields.password });
      else setError(err instanceof Error ? err.message : 'Could not set the password.');
    } finally {
      setBusy(false);
    }
  });

  return (
    <AuthLayout
      title={title}
      description={
        invite
          ? 'Welcome to the D Solutions Business Portal. Pick a password to finish setting up your account.'
          : 'You’ll be signed out everywhere else.'
      }
    >
      <form noValidate onSubmit={submit} className="grid gap-4">
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg bg-bad-bg px-3 py-2.5 text-sm text-bad"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>
              {error}{' '}
              <Link to="/forgot-password" className="font-medium underline">
                Ask for a new link
              </Link>
            </span>
          </div>
        )}
        <Field label="New password" error={e.password?.message}>
          <PasswordInput autoComplete="new-password" autoFocus {...register('password')} />
        </Field>
        <ul className="grid gap-1 text-xs" aria-label="Password requirements">
          {RULES.map(([label, ok]) => {
            const met = ok(pw);
            return (
              <li
                key={label}
                className={cn('flex items-center gap-1.5', met ? 'text-ok' : 'text-muted-foreground')}
              >
                {met ? <Check className="size-3.5" /> : <X className="size-3.5" />} {label}
              </li>
            );
          })}
        </ul>
        <Field label="Repeat the password" error={e.confirm?.message}>
          <PasswordInput autoComplete="new-password" {...register('confirm')} />
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />}
          {invite ? 'Set password' : 'Save new password'}
        </Button>
      </form>
    </AuthLayout>
  );
}
