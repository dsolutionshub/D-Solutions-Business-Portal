import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/app/theme/useTheme';
import { Button } from '@/components/ui/button';

/** Light / dark switch for the public pages (the app has its own in the top bar). */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const next = resolvedTheme === 'dark' ? 'light' : 'dark';
  const Icon = resolvedTheme === 'dark' ? Sun : Moon;
  return (
    <Button variant="ghost" size="icon" onClick={() => setTheme(next)} aria-label={`Switch to ${next} theme`}>
      <Icon />
    </Button>
  );
}
