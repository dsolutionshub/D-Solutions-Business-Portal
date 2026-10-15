import { AlertCircle, ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A collapsible form section: a one-line header (number, title, description, tags) and the fields
 * across the full width underneath. Closed sections stay mounted (hidden), so their values and
 * validation are kept. A section opens itself when a field inside has an error; the first such
 * section also moves the focus to that field.
 */
export function FormAccordionSection({
  step,
  title,
  description,
  required,
  hasError,
  defaultOpen = false,
  children
}: {
  step?: number;
  title: string;
  description?: ReactNode;
  /** Shows a "Required" tag: the section holds fields that must be filled. */
  required?: boolean;
  hasError?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!hasError) return;
    setOpen(true);
    // after it opens: if this is the first section with an error, take the user to the field
    const frame = requestAnimationFrame(() => {
      const first = document.querySelector('[data-section-error="true"]');
      if (first !== ref.current || ref.current?.contains(document.activeElement)) return;
      const field = ref.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      field?.focus({ preventScroll: true });
      (field ?? ref.current)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, [hasError]);

  return (
    <section ref={ref} data-section-error={hasError || undefined} className="border-b last:border-b-0">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen(o => !o)}
          className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-6"
        >
          {step !== undefined && (
            <span
              aria-hidden
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                open ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              )}
            >
              {step}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">{title}</span>
            {description && (
              <span className="block truncate text-[13px] font-normal text-muted-foreground">
                {description}
              </span>
            )}
          </span>
          {hasError ? (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-bad-bg px-2 py-0.5 text-[11px] font-medium text-bad">
              <AlertCircle className="size-3" /> Needs attention
            </span>
          ) : (
            required && (
              <span className="hidden shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground sm:inline">
                Required
              </span>
            )
          )}
          <ChevronDown
            aria-hidden
            className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
          />
        </button>
      </h2>
      <div
        id={bodyId}
        hidden={!open}
        className={cn(
          'grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-4 px-5 pb-5 pt-1 sm:px-6',
          open ? 'grid' : 'hidden'
        )}
      >
        {children}
      </div>
    </section>
  );
}
