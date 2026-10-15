import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/** Round "back" button shown in front of a page's title or record header. */
export function BackButton({ to, label }: { to: string; label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to={to}
          aria-label={label}
          className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-card text-subtle-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="size-4" />
        </Link>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
