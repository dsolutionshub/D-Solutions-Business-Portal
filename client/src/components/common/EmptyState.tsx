import { Search, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function EmptyState({
  icon: Icon = Search,
  title,
  description,
  action,
  className
}: {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-1.5 px-4 py-11 text-center text-[13px] text-muted-foreground',
        className
      )}
    >
      <span className="mb-1 flex size-11 items-center justify-center rounded-xl bg-muted text-subtle-foreground">
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="font-semibold text-foreground">{title}</div>
      {description && <div className="max-w-md">{description}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
