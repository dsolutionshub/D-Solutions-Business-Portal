import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * The D Solutions mark: a bold "D" on an indigo → violet tile, with a small accent dot (the
 * "solution" that completes it). `inverted` = white tile for dark / coloured backgrounds.
 */
export function LogoMark({
  size = 32,
  inverted = false,
  className
}: {
  size?: number;
  inverted?: boolean;
  className?: string;
}) {
  const id = useId().replace(/:/g, '');
  const tile = inverted ? '#ffffff' : `url(#${id}-bg)`;
  const ink = inverted ? `url(#${id}-bg)` : '#ffffff';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      className={cn('shrink-0', className)}
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4f46e5" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill={tile} />
      {/* the D: outer bowl minus the counter */}
      <path
        fillRule="evenodd"
        fill={ink}
        d="M11 9h8.5C26.4 9 31 13.6 31 20s-4.6 11-11.5 11H11V9Zm5 4.6v12.8h3.3c3.9 0 6.5-2.6 6.5-6.4s-2.6-6.4-6.5-6.4H16Z"
      />
      <circle cx="31.5" cy="31.5" r="3.2" fill={inverted ? '#818cf8' : '#a5b4fc'} />
    </svg>
  );
}

/** Mark + "D Solutions / Business Portal". */
export function Logo({
  size = 32,
  inverted = false,
  subtitle = true,
  className
}: {
  size?: number;
  inverted?: boolean;
  subtitle?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <LogoMark size={size} inverted={inverted} />
      <span className="leading-tight">
        <span className="block font-semibold tracking-tight">D Solutions</span>
        {subtitle && (
          <span className={cn('block text-xs', inverted ? 'text-indigo-100' : 'text-muted-foreground')}>
            Business Portal
          </span>
        )}
      </span>
    </span>
  );
}
