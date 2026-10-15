import type { ReactNode } from 'react';
import { useSidebar } from '@/app/layout/useSidebar';
import { useTheme, type Theme } from '@/app/theme/useTheme';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

const THEMES: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'Match system' }
];

function Row({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b py-3.5 last:border-b-0">
      <div>
        <div className="font-semibold">{title}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
      {children}
    </div>
  );
}

/** Per-device preferences, kept in this browser. */
export function AppearanceTab() {
  const { theme, setTheme } = useTheme();
  const { collapsed, setCollapsed } = useSidebar();
  return (
    <div className="max-w-2xl px-5 py-2">
      <Row title="Theme" hint="Light, dark, or follow this device's setting">
        <div role="radiogroup" aria-label="Theme" className="inline-flex gap-0.5 rounded-lg bg-muted p-[3px]">
          {THEMES.map(t => (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={theme === t.value}
              onClick={() => setTheme(t.value)}
              className={cn(
                'h-7 rounded-md px-3 text-xs font-medium text-subtle-foreground',
                theme === t.value && 'bg-card text-foreground shadow-sm'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </Row>
      <Row title="Compact sidebar" hint="Icon-only navigation on wide screens (this device)">
        <Switch checked={collapsed} onCheckedChange={setCollapsed} aria-label="Compact sidebar" />
      </Row>
    </div>
  );
}
