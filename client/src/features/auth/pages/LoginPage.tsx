import { loginSchema } from '@dsol/shared';
import { AlertCircle, Loader2, LogIn } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Field } from '@/components/common/Field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
import { useLogin, useSignedIn } from '../api';
import { AuthLayout } from '../components/AuthLayout';
import { PasswordInput } from '../components/PasswordInput';

type Values = { email: string; password: string };

/** Only same-site paths are allowed as "come back here" targets. */
const safeNext = (next: string | null) =>
  next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const signedIn = useSignedIn();
  const login = useLogin();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    setFocus,
    setError: setFieldError,
    formState
  } = useForm<Values>({
    defaultValues: { email: '', password: '' }
  });
  const e = formState.errors;

  // already signed in: straight on
  useEffect(() => {
    if (signedIn.data) navigate(next, { replace: true });
  }, [signedIn.data, next, navigate]);

  useEffect(() => setFocus('email'), [setFocus]);

  const submit = handleSubmit(async v => {
    setError(null);
    const parsed = loginSchema.safeParse(v);
    if (!parsed.success) {
      for (const i of parsed.error.issues) setFieldError(i.path[0] as keyof Values, { message: i.message });
      return;
    }
    try {
      await login.mutateAsync(parsed.data);
      navigate(next, { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error ? err.message : 'Could not sign in. Try again.'
      );
      setValue('password', '');
      setFocus('password');
    }
  });

  return (
    <AuthLayout title="Sign in" description="Use your work email and portal password.">
      <form noValidate onSubmit={submit} className="grid gap-4">
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-bad-bg px-3 py-2.5 text-sm text-bad"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {error}
          </div>
        )}
        {params.get('reset') === '1' && !error && (
          <p role="status" className="rounded-lg bg-ok-bg px-3 py-2.5 text-sm text-ok">
            Your password is set. Sign in with it now.
          </p>
        )}
        <Field label="Work email" error={e.email?.message}>
          <Input
            type="email"
            autoComplete="username"
            inputMode="email"
            placeholder="you@company.com"
            {...register('email')}
          />
        </Field>
        <Field
          label={
            <span className="flex items-center justify-between">
              Password
              <Link
                to="/forgot-password"
                className="text-xs font-medium text-primary-soft-foreground hover:underline"
              >
                Forgot password?
              </Link>
            </span>
          }
          error={e.password?.message}
        >
          <PasswordInput autoComplete="current-password" {...register('password')} />
        </Field>
        <Button type="submit" size="lg" className="mt-1 w-full" disabled={login.isPending}>
          {login.isPending ? <Loader2 className="animate-spin" /> : <LogIn />}
          Sign in
        </Button>
      </form>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        No account? Ask an Admin to invite you.
      </p>
    </AuthLayout>
  );
}
