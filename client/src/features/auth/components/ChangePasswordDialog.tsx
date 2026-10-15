import { changePasswordSchema } from '@dsol/shared';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Field } from '@/components/common/Field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { applyServerErrors } from '@/lib/forms';
import { authApi } from '../api';
import { PasswordInput } from './PasswordInput';

type Values = { current: string; password: string; confirm: string };

/** Change your own password. Other devices are signed out; this one stays signed in. */
export function ChangePasswordDialog({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const { register, handleSubmit, reset, setError, formState } = useForm<Values>();
  const e = formState.errors;
  useEffect(() => {
    if (open) reset({ current: '', password: '', confirm: '' });
  }, [open, reset]);

  const submit = handleSubmit(async v => {
    if (v.password !== v.confirm) return setError('confirm', { message: 'The passwords don’t match.' });
    const parsed = changePasswordSchema.safeParse({ current: v.current, password: v.password });
    if (!parsed.success) {
      for (const i of parsed.error.issues) setError(i.path[0] as keyof Values, { message: i.message });
      return;
    }
    setBusy(true);
    try {
      await authApi.changePassword(parsed.data);
      toast.success('Password changed. Other devices were signed out.');
      onOpenChange(false);
    } catch (err) {
      applyServerErrors(err, setError);
    } finally {
      setBusy(false);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form noValidate onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Change password</DialogTitle>
            <DialogDescription>
              At least 10 characters. You stay signed in here; other devices are signed out.
            </DialogDescription>
          </DialogHeader>
          <Field label="Current password" required error={e.current?.message}>
            <PasswordInput autoComplete="current-password" {...register('current')} />
          </Field>
          <Field label="New password" required error={e.password?.message}>
            <PasswordInput autoComplete="new-password" {...register('password')} />
          </Field>
          <Field label="Repeat the new password" required error={e.confirm?.message}>
            <PasswordInput autoComplete="new-password" {...register('confirm')} />
          </Field>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              Change password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
