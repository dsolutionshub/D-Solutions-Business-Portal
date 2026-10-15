import { Eye, EyeOff, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { SecretMode } from '../formMapping';

/**
 * A secret on the project form. Stored values are never loaded: an existing secret shows
 * "•••••• saved" with Replace / Clear. New values are typed in a masked input with a show toggle.
 */
export function SecretInput({
  name,
  label,
  id,
  ...aria
}: {
  name: string;
  label: string;
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}) {
  // Untyped form context: the path is dynamic (secrets.<section>.<field>).
  const { register, watch, setValue } = useFormContext();
  const path = name;
  const stored = watch(`${path}.stored`) as boolean;
  const mode = watch(`${path}.mode`) as SecretMode;
  const [show, setShow] = useState(false);
  const setMode = (m: SecretMode) => {
    setValue(`${path}.mode`, m, { shouldDirty: true });
    if (m !== 'replace') setValue(`${path}.value`, '', { shouldDirty: true });
  };

  if (stored && mode === 'keep')
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span
          id={id}
          className="inline-flex h-9 items-center rounded-md border border-dashed border-border-strong bg-surface-2 px-3 font-mono text-xs text-muted-foreground"
        >
          •••••• saved
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setMode('replace')}
          aria-label={`Replace ${label}`}
        >
          Replace
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setMode('clear')}
          aria-label={`Clear ${label}`}
        >
          Clear
        </Button>
      </div>
    );

  if (mode === 'clear')
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span id={id} className="inline-flex h-9 items-center rounded-md bg-bad-bg px-3 text-xs text-bad">
          Will be removed when you save
        </span>
        <Button type="button" size="sm" variant="ghost" onClick={() => setMode('keep')}>
          <RotateCcw /> Undo
        </Button>
      </div>
    );

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <Input
          id={id}
          {...aria}
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          spellCheck={false}
          placeholder={stored ? 'New value' : 'Stored encrypted'}
          className="pr-10 font-mono"
          {...register(`${path}.value`)}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-0.5 top-0.5 size-8"
          onClick={() => setShow(s => !s)}
          aria-label={show ? `Hide ${label}` : `Show ${label}`}
        >
          {show ? <EyeOff /> : <Eye />}
        </Button>
      </div>
      {stored && (
        <Button type="button" size="sm" variant="ghost" onClick={() => setMode('keep')}>
          Cancel
        </Button>
      )}
    </div>
  );
}
