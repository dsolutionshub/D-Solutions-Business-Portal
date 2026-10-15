import { createContext, useContext } from 'react';

export interface SidebarState {
  /** Desktop: icon-only sidebar. Remembered on this device. */
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  /** Mobile: the slide-over menu. */
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

export const SidebarContext = createContext<SidebarState | null>(null);

export function useSidebar(): SidebarState {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebar must be used inside <AppShell>');
  return ctx;
}
