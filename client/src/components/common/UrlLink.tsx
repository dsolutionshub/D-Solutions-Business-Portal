import { cn } from '@/lib/utils';

/** Opens in a new tab; shows the URL without the protocol. */
export function UrlLink({ href, className }: { href: string | null | undefined; className?: string }) {
  if (!href) return <span className="text-muted-foreground">—</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn('break-all text-primary-soft-foreground hover:underline', className)}
    >
      {href.replace(/^https?:\/\//, '')}
    </a>
  );
}
