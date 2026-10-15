import { Eye, EyeOff } from 'lucide-react';
import { forwardRef, useState, type InputHTMLAttributes } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** A password field with a show / hide button. */
export const PasswordInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function PasswordInput({ className, ...props }, ref) {
    const [show, setShow] = useState(false);
    return (
      <div className="relative">
        <Input ref={ref} type={show ? 'text' : 'password'} className={cn('pr-10', className)} {...props} />
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          aria-label={show ? 'Hide password' : 'Show password'}
          aria-pressed={show}
          className="absolute right-1 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [&_svg]:size-4"
        >
          {show ? <EyeOff /> : <Eye />}
        </button>
      </div>
    );
  }
);
