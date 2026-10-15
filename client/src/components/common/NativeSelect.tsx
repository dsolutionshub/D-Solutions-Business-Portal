import { ChevronDown } from 'lucide-react';
import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * A styled native <select>. Native keeps keyboard, screen-reader and mobile pickers working
 * and plugs straight into React Hook Form's register().
 */
export const NativeSelect = forwardRef<HTMLSelectElement, ComponentPropsWithoutRef<'select'>>(
  ({ className, children, ...props }, ref) => (
    <div className={cn('relative', className)}>
      <select
        ref={ref}
        className="h-9 w-full appearance-none truncate rounded-md border border-input bg-card py-0 pl-3 pr-8 text-sm shadow-sm outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive"
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
    </div>
  )
);
NativeSelect.displayName = 'NativeSelect';
