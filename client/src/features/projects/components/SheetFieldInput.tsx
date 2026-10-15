import type { SheetFieldDef } from '@dsol/shared';
import { get, useFormContext } from 'react-hook-form';
import { Field } from '@/components/common/Field';
import { MoneyInput } from '@/components/common/MoneyInput';
import { NativeSelect } from '@/components/common/NativeSelect';
import { Input } from '@/components/ui/input';
import { listOptions, useLists } from '@/lib/useLists';
import type { ProjectFormValues, SectionKey } from '../formMapping';
import { SecretInput } from './SecretInput';

/** One project-sheet field, rendered from its definition in SHEET_SECTIONS. */
export function SheetFieldInput({
  section,
  field,
  initial
}: {
  section: SectionKey;
  field: SheetFieldDef;
  initial?: string;
}) {
  const { register, formState } = useFormContext<ProjectFormValues>();
  const lists = useLists();

  if (field.type === 'secret') {
    const name = `secrets.${section}.${field.key}`;
    return (
      <Field label={field.label} error={get(formState.errors, `${name}.value`)?.message}>
        <SecretInput name={name} label={field.label} />
      </Field>
    );
  }

  const name = `sheet.${section}.${field.key}` as const;
  const error = get(formState.errors, name)?.message as string | undefined;
  const reg = register(name as never);
  let control;
  if (field.type === 'select') {
    const opts = field.list ? listOptions(lists.data, field.list, initial) : [...(field.options ?? [])];
    control = (
      <NativeSelect {...reg}>
        {!(field.key === 'auto') && <option value="">Select</option>}
        {opts.map(o => (
          <option key={o}>{o}</option>
        ))}
      </NativeSelect>
    );
  } else if (field.type === 'money') control = <MoneyInput step="0.01" placeholder="0" {...reg} />;
  else if (field.type === 'date') control = <Input type="date" {...reg} />;
  else if (field.type === 'url') control = <Input type="url" placeholder="https://" {...reg} />;
  else if (field.type === 'domain')
    control = <Input placeholder="example.com" autoCapitalize="none" spellCheck={false} {...reg} />;
  else control = <Input spellCheck={false} {...reg} />;

  return (
    <Field label={field.label} required={field.required} error={error}>
      {control}
    </Field>
  );
}
