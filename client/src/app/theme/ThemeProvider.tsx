import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { storage } from '@/lib/storage';
import { ThemeContext, type Theme } from './useTheme';

const KEY = 'dsol-theme'; // also read by the inline script in index.html
const query = () => window.matchMedia('(prefers-color-scheme: dark)');

function readTheme(): Theme {
  const t = storage.get(KEY);
  return t === 'light' || t === 'dark' ? t : 'system';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readTheme);
  const [systemDark, setSystemDark] = useState(() => query().matches);

  useEffect(() => {
    const mq = query();
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
  }, [resolvedTheme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    storage.set(KEY, next);
  }, []);

  const value = useMemo(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
