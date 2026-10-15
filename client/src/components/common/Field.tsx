import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Label + control + hint + error. The control gets id, aria-invalid and aria-describedby wired up,
 * so screen readers announce the label, hint and error with it.
 */
export function Field({
  label,
  required,
  hint,
  error,
  children,
  className,
  wide
}: {
  label: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  error?: string;
  children: ReactElement<Record<string, unknown>>;
  className?: string;
  /** Span the whole row of the section grid. */
  wide?: boolean;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
  const control = isValidElement(children)
    ? cloneElement(children, {
        id: (children.props.id as string | undefined) ?? id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
        // aria-required is only valid on form controls, not on a group of chips or checkboxes
        'aria-required': (required && children.props.role !== 'group') || undefined
      })
    : children;
  return (
    <div className={cn('min-w-0', wide && 'col-span-full', className)}>
      <label
        htmlFor={(children.props.id as string | undefined) ?? id}
        className="mb-1.5 block text-xs font-medium text-subtle-foreground"
      >
        {label}
        {required && (
          <span className="ml-0.5 text-destructive" aria-hidden>
            *
          </span>
        )}
      </label>
      {control}
      {hint && !error && (
        <div id={hintId} className="mt-1.5 text-xs text-muted-foreground">
          {hint}
        </div>
      )}
      {error && (
        <div id={errorId} role="alert" className="mt-1.5 text-xs text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}

/** Same layout for controls that aren't a single input (checkbox groups, segmented buttons). */
export function FieldGroup({
  label,
  required,
  error,
  hint,
  children,
  wide
}: {
  label: ReactNode;
  required?: boolean;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <fieldset className={cn('min-w-0', wide && 'col-span-full')}>
      <legend className="mb-1.5 block text-xs font-medium text-subtle-foreground">
        {label}
        {required && (
          <span className="ml-0.5 text-destructive" aria-hidden>
            *
          </span>
        )}
      </legend>
      {children}
      {hint && !error && <div className="mt-1.5 text-xs text-muted-foreground">{hint}</div>}
      {error && (
        <div role="alert" className="mt-1.5 text-xs text-destructive">
          {error}
        </div>
      )}
    </fieldset>
  );
}
