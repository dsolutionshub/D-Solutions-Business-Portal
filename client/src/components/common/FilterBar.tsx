import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Toolbar above a table: search, selects, segmented filters. Shows "Clear filters" when any is set. */
export function FilterBar({
  children,
  active,
  onClear
}: {
  children: ReactNode;
  active?: boolean;
  onClear?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3.5">
      {children}
      {active && onClear && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          Clear filters
        </Button>
      )}
    </div>
  );
}

/** Segmented control (prototype "seg"), e.g. All / Active / Inactive. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly (readonly [T, string])[];
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex flex-wrap gap-0.5 rounded-lg bg-muted p-[3px]"
    >
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn(
            'h-7 rounded-md px-3 text-xs font-medium text-subtle-foreground transition-colors hover:text-foreground',
            value === v && 'bg-card text-foreground shadow-sm'
          )}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
