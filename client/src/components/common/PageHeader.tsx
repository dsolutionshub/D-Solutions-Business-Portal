import type { ReactNode } from 'react';
import { BackButton } from './BackButton';

export function PageHeader({
  title,
  description,
  actions,
  back
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** a back button in front of the title */
  back?: { to: string; label: string };
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        {back && <BackButton to={back.to} label={back.label} />}
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
          {description && <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
