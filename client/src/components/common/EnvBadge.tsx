import { ENV_NAMES } from '@dsol/shared';
import { cn } from '@/lib/utils';

const ENV_TONE: Record<string, string> = {
  DEV: 'bg-muted text-subtle-foreground ring-1 ring-inset ring-border-strong',
  QA: 'bg-purple-bg text-purple',
  STG: 'bg-warn-bg text-warn',
  PROD: 'bg-ok-bg text-ok'
};

/** Environment code chip (DEV / QA / STG / PROD / custom). */
export function EnvBadge({ env }: { env: string }) {
  return (
    <span
      title={ENV_NAMES[env] ?? env}
      className={cn(
        'inline-flex h-5 items-center rounded px-1.5 text-[11px] font-semibold tracking-wide',
        ENV_TONE[env] ?? 'bg-info-bg text-info'
      )}
    >
      {env}
    </span>
  );
}
