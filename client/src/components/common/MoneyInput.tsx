import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Rupee amount input with a ₹ prefix. Works with React Hook Form's register().
 * People type rupees; convert with rupeesToPaise() before sending (the API takes paise).
 */
export const MoneyInput = forwardRef<HTMLInputElement, Omit<ComponentPropsWithoutRef<'input'>, 'type'>>(
  ({ className, ...props }, ref) => (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        ₹
      </span>
      <Input
        ref={ref}
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        className={cn('pl-7 tabular-nums', className)}
        {...props}
      />
    </div>
  )
);
MoneyInput.displayName = 'MoneyInput';
