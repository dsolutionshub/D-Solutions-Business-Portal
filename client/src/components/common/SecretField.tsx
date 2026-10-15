import { Copy, Eye, EyeOff, Loader2, Lock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const AUTO_HIDE_MS = 30_000;

/**
 * A stored secret, masked by default. The value is never in the page until someone asks:
 * the eye calls the reveal API (role-checked and audit-logged on the server) and the value
 * hides itself again after 30 seconds. Copy fetches the value the same way without showing it.
 *
 * Without `reveal` (the role can't reveal) it shows that a value is stored, and why it's locked.
 */
export function SecretField({
  hasValue,
  reveal,
  label
}: {
  hasValue: boolean;
  reveal?: () => Promise<string>;
  label: string;
}) {
  const [value, setValue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (value === null) return;
    const t = setTimeout(() => setValue(null), AUTO_HIDE_MS);
    return () => clearTimeout(t);
  }, [value]);

  if (!hasValue) return <span className="text-muted-foreground">—</span>;

  const masked = (
    <span className="inline-flex h-[26px] items-center rounded-md border border-dashed border-border-strong bg-surface-2 px-2 font-mono text-xs tracking-[0.12em] text-muted-foreground">
      ••••••••
    </span>
  );

  if (!reveal)
    return (
      <span className="flex items-center gap-1.5">
        {masked}
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              tabIndex={0}
              className="rounded p-1 text-muted-foreground"
              aria-label="Your role can’t reveal secrets"
            >
              <Lock className="size-3.5" />
            </span>
          </TooltipTrigger>
          <TooltipContent>Your role can’t reveal secrets</TooltipContent>
        </Tooltip>
      </span>
    );

  const fetchValue = async () => {
    setBusy(true);
    try {
      return await reveal();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not reveal this value.');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const toggle = async () => {
    if (value !== null) return setValue(null);
    setValue(await fetchValue());
  };

  const copy = async () => {
    const v = value ?? (await fetchValue());
    if (v === null) return;
    try {
      await navigator.clipboard.writeText(v);
      toast.success(`${label} copied`);
    } catch {
      toast.error('Copy is blocked by the browser.');
    }
  };

  return (
    <span className="flex min-w-0 flex-nowrap items-center gap-1">
      {value !== null ? <span className="min-w-0 break-all font-mono text-[12.5px]">{value}</span> : masked}
      <Button
        variant="ghost"
        size="icon"
        className="size-7 flex-none"
        onClick={toggle}
        disabled={busy}
        aria-label={value !== null ? `Hide ${label}` : `Show ${label}`}
      >
        {busy ? <Loader2 className="animate-spin" /> : value !== null ? <EyeOff /> : <Eye />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-7 flex-none"
        onClick={copy}
        disabled={busy}
        aria-label={`Copy ${label}`}
      >
        <Copy />
      </Button>
    </span>
  );
}
