import { email, optionalText, phone, requiredText } from '@dsol/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Field } from '@/components/common/Field';
import { NativeSelect } from '@/components/common/NativeSelect';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { applyServerErrors, onInvalid, optional } from '@/lib/forms';
import { useAddContact } from '../hooks/useClients';

const schema = z.object({
  name: requiredText('Name is required.', 120),
  email: z.string().trim().min(1, 'Email is required.').pipe(email),
  role: optional(optionalText(120)),
  phone: optional(phone.nullable()),
  tag: z.enum(['Technical', 'Billing', 'Marketing']),
  notifyReleases: z.boolean()
});
type Values = {
  name: string;
  email: string;
  role: string;
  phone: string;
  tag: 'Technical' | 'Billing' | 'Marketing';
  notifyReleases: boolean;
};
type Output = z.output<typeof schema>;
const empty: Values = { name: '', email: '', role: '', phone: '', tag: 'Technical', notifyReleases: true };

export function AddContactDialog({
  clientId,
  clientName,
  open,
  onOpenChange
}: {
  clientId: string;
  clientName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const add = useAddContact(clientId);
  const { register, handleSubmit, formState, reset, setError } = useForm<Values, unknown, Output>({
    resolver: zodResolver(schema) as unknown as Resolver<Values, unknown, Output>,
    defaultValues: empty
  });
  useEffect(() => {
    if (open) reset(empty);
  }, [open, reset]);
  const e = formState.errors;

  const submit = handleSubmit(async v => {
    try {
      await add.mutateAsync({ ...v, altPhone: null });
      toast.success(`${v.name} added to ${clientName}`);
      onOpenChange(false);
    } catch (err) {
      applyServerErrors(err, setError);
    }
  }, onInvalid);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-md">
        <form noValidate onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Add contact</DialogTitle>
            <DialogDescription>{clientName}</DialogDescription>
          </DialogHeader>
          <Field label="Full name" required error={e.name?.message}>
            <Input autoComplete="off" {...register('name')} />
          </Field>
          <Field label="Email" required error={e.email?.message}>
            <Input type="email" {...register('email')} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Role / title" error={e.role?.message}>
              <Input placeholder="e.g. Ops Manager" {...register('role')} />
            </Field>
            <Field label="Phone" error={e.phone?.message}>
              <Input type="tel" {...register('phone')} />
            </Field>
          </div>
          <Field label="Contact type">
            <NativeSelect {...register('tag')}>
              <option>Technical</option>
              <option>Billing</option>
              <option>Marketing</option>
            </NativeSelect>
          </Field>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-[hsl(var(--primary))]"
              {...register('notifyReleases')}
            />
            Send release and maintenance emails
          </label>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={formState.isSubmitting}>
              {formState.isSubmitting && <Loader2 className="animate-spin" />}
              Add contact
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
