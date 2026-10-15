import { Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Search box that reports changes after the user pauses typing (300 ms). */
export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
  delay = 300
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
  delay?: number;
}) {
  const [text, setText] = useState(value);
  const latest = useRef(onChange);
  latest.current = onChange;

  // Follow outside changes (e.g. "Clear filters").
  useEffect(() => setText(value), [value]);

  useEffect(() => {
    if (text === value) return;
    const t = setTimeout(() => latest.current(text.trim()), delay);
    return () => clearTimeout(t);
  }, [text, value, delay]);

  return (
    <div className={cn('relative min-w-[200px] max-w-[340px] flex-1', className)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="pl-9 pr-8 [&::-webkit-search-cancel-button]:hidden"
      />
      {text && (
        <button
          type="button"
          onClick={() => {
            setText('');
            onChange('');
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
