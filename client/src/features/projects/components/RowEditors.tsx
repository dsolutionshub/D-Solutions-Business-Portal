import { Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { get, useFieldArray, useFormContext } from 'react-hook-form';
import { MoneyInput } from '@/components/common/MoneyInput';
import { NativeSelect } from '@/components/common/NativeSelect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { ProjectFormValues } from '../formMapping';

function RowError({ message }: { message?: string }) {
  return message ? (
    <div role="alert" className="mt-1 text-xs text-destructive">
      {message}
    </div>
  ) : null;
}

/** "Other keys": label, value, Secret toggle. Stored secrets show "•••••• saved" with Replace. */
export function ExtraKeysEditor() {
  const { control, register, watch, setValue, formState } = useFormContext<ProjectFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: 'extraKeys' });
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const rows = watch('extraKeys');

  return (
    <div className="col-span-full flex flex-col gap-3">
      {fields.map((f, i) => {
        const row = rows[i];
        const err = (k: string) =>
          get(formState.errors, `extraKeys.${i}.${k}`)?.message as string | undefined;
        const masked = row?.isSecret && row.storedSecret && !row.replace;
        return (
          <div
            key={f.id}
            className="flex flex-wrap items-start gap-2 rounded-lg border p-2.5 sm:flex-nowrap sm:border-0 sm:p-0"
          >
            <div className="min-w-0 flex-[1_1_200px]">
              <Input
                placeholder="Key name"
                aria-label={`Key ${i + 1} name`}
                aria-invalid={!!err('label') || undefined}
                {...register(`extraKeys.${i}.label`)}
              />
              <RowError message={err('label')} />
            </div>
            <div className="min-w-0 flex-[2_1_260px]">
              {masked ? (
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-9 items-center rounded-md border border-dashed border-border-strong bg-surface-2 px-3 font-mono text-xs text-muted-foreground">
                    •••••• saved
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setValue(`extraKeys.${i}.replace`, true, { shouldDirty: true })}
                  >
                    Replace
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <Input
                    type={row?.isSecret && !shown[f.id] ? 'password' : 'text'}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={row?.isSecret ? 'Stored encrypted' : 'Value'}
                    aria-label={`Key ${i + 1} value`}
                    aria-invalid={!!err('value') || undefined}
                    className={cn('font-mono', row?.isSecret && 'pr-10')}
                    {...register(`extraKeys.${i}.value`)}
                  />
                  {row?.isSecret && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0.5 top-0.5 size-8"
                      aria-label={shown[f.id] ? 'Hide value' : 'Show value'}
                      onClick={() => setShown(s => ({ ...s, [f.id]: !s[f.id] }))}
                    >
                      {shown[f.id] ? <EyeOff /> : <Eye />}
                    </Button>
                  )}
                </div>
              )}
              <RowError message={err('value')} />
            </div>
            <label className="flex h-9 cursor-pointer items-center gap-1.5 whitespace-nowrap text-sm">
              <input
                type="checkbox"
                className="size-4 accent-[hsl(var(--primary))]"
                {...register(`extraKeys.${i}.isSecret`)}
              />
              Secret
            </label>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove key ${i + 1}`}
              onClick={() => remove(i)}
            >
              <Trash2 />
            </Button>
          </div>
        );
      })}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="self-start"
        onClick={() => append({ label: '', isSecret: false, value: '', storedSecret: false, replace: false })}
      >
        <Plus /> Add key
      </Button>
    </div>
  );
}

/** "Other recurring costs": service, amount, cycle, next due date. */
export function CostsEditor() {
  const { control, register, formState } = useFormContext<ProjectFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: 'costs' });
  return (
    <div className="col-span-full flex flex-col gap-3">
      {fields.map((f, i) => {
        const err = (k: string) => get(formState.errors, `costs.${i}.${k}`)?.message as string | undefined;
        return (
          <div
            key={f.id}
            className="flex flex-wrap items-start gap-2 rounded-lg border p-2.5 sm:flex-nowrap sm:border-0 sm:p-0"
          >
            <div className="min-w-0 flex-[2_1_200px]">
              <Input
                placeholder="Service"
                aria-label={`Cost ${i + 1} service`}
                aria-invalid={!!err('name') || undefined}
                {...register(`costs.${i}.name`)}
              />
              <RowError message={err('name')} />
            </div>
            <div className="min-w-0 flex-[1_1_110px]">
              <MoneyInput
                step="0.01"
                placeholder="0"
                aria-label={`Cost ${i + 1} amount`}
                aria-invalid={!!err('amount') || undefined}
                {...register(`costs.${i}.amount`)}
              />
              <RowError message={err('amount')} />
            </div>
            <NativeSelect
              className="flex-[1_1_120px]"
              aria-label={`Cost ${i + 1} billing cycle`}
              {...register(`costs.${i}.cycle`)}
            >
              <option>Monthly</option>
              <option>Yearly</option>
            </NativeSelect>
            <div className="min-w-0 flex-[1_1_150px]">
              <Input
                type="date"
                title="Next due date"
                aria-label={`Cost ${i + 1} next due date`}
                aria-invalid={!!err('nextDue') || undefined}
                {...register(`costs.${i}.nextDue`)}
              />
              <RowError message={err('nextDue')} />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove cost ${i + 1}`}
              onClick={() => remove(i)}
            >
              <Trash2 />
            </Button>
          </div>
        );
      })}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="self-start"
        onClick={() => append({ name: '', amount: '', cycle: 'Monthly', nextDue: '' })}
      >
        <Plus /> Add cost
      </Button>
    </div>
  );
}
