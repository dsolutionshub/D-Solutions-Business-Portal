import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

/** Copy a plain value to the clipboard. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-7 flex-none"
      aria-label={`Copy ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          toast.success(`${label} copied`);
        } catch {
          toast.error('Copy is blocked by the browser.');
        }
      }}
    >
      <Copy />
    </Button>
  );
}
