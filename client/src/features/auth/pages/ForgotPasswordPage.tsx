import { forgotPasswordSchema } from '@dsol/shared';
import { ArrowLeft, Loader2, MailCheck } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Field } from '@/components/common/Field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authApi } from '../api';
import { AuthLayout } from '../components/AuthLayout';

/** "Forgot password?": always the same answer, whether or not the email has an account. */
export function ForgotPasswordPage() {
  const [sent, setSent] = useState<{ email: string; devLink?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const { register, handleSubmit, setError, formState } = useForm<{ email: string }>({
    defaultValues: { email: '' }
  });

  const submit = handleSubmit(async v => {
    const parsed = forgotPasswordSchema.safeParse(v);
    if (!parsed.success) return setError('email', { message: parsed.error.issues[0]!.message });
    setBusy(true);
    try {
      const r = await authApi.forgot(parsed.data.email);
      setSent({ email: parsed.data.email, devLink: r.devLink });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send the link. Try again.');
    } finally {
      setBusy(false);
    }
  });

  return (
    <AuthLayout title="Reset your password" description="We’ll email you a link to choose a new password.">
      {sent ? (
        <div className="grid gap-4">
          <div role="status" className="flex items-start gap-3 rounded-xl border bg-card p-4">
            <MailCheck className="mt-0.5 size-5 shrink-0 text-ok" />
            <p className="text-sm">
              If <b>{sent.email}</b> has a portal account, a reset link is on its way. It works once, for 1
              hour. Check spam if it doesn’t arrive in a few minutes.
            </p>
          </div>
          {sent.devLink && (
            <Button asChild variant="outline">
              <a href={sent.devLink}>Open the reset link (local development only)</a>
            </Button>
          )}
          <Button asChild variant="ghost">
            <Link to="/login">
              <ArrowLeft /> Back to sign in
            </Link>
          </Button>
        </div>
      ) : (
        <form noValidate onSubmit={submit} className="grid gap-4">
          <Field label="Work email" error={formState.errors.email?.message}>
            <Input
              type="email"
              autoComplete="username"
              autoFocus
              placeholder="you@company.com"
              {...register('email')}
            />
          </Field>
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            Send reset link
          </Button>
          <Button asChild variant="ghost">
            <Link to="/login">
              <ArrowLeft /> Back to sign in
            </Link>
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
