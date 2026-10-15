import { useEffect, useMemo, useState } from 'react';
import { Outlet, ScrollRestoration, useLocation } from 'react-router';
import { ErrorState } from '@/components/common/ErrorState';
import { Card } from '@/components/ui/card';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useMe } from '@/lib/auth';
import { storage } from '@/lib/storage';
import { cn } from '@/lib/utils';
import { NoAccess } from '../NoAccess';
import { useCrumbs } from './crumbs';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { SidebarContext } from './useSidebar';

const KEY = 'dsol-sidebar';

export function AppShell() {
  const [collapsed, setCollapsedState] = useState(() => storage.get(KEY) === 'collapsed');
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();
  const crumbs = useCrumbs();
  const me = useMe();
  const pageTitle = crumbs[crumbs.length - 1]?.label;

  // Close the mobile menu after navigating.
  useEffect(() => setMobileOpen(false), [pathname]);

  useEffect(() => {
    document.title = (typeof pageTitle === 'string' ? pageTitle + ' · ' : '') + 'D Solutions Portal';
  }, [pageTitle]);

  const value = useMemo(
    () => ({
      collapsed,
      setCollapsed: (c: boolean) => {
        setCollapsedState(c);
        storage.set(KEY, c ? 'collapsed' : 'open');
      },
      mobileOpen,
      setMobileOpen
    }),
    [collapsed, mobileOpen]
  );

  return (
    <SidebarContext.Provider value={value}>
      <div className="flex min-h-screen">
        <aside
          aria-label="Primary navigation"
          className={cn(
            'sticky top-0 hidden h-screen flex-none border-r bg-card transition-[width] duration-200 lg:block',
            collapsed ? 'w-sidebar-collapsed' : 'w-sidebar'
          )}
        >
          <Sidebar collapsed={collapsed} />
        </aside>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-[264px] p-0">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <SheetDescription className="sr-only">Navigate between portal screens</SheetDescription>
            <Sidebar collapsed={false} />
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main
            id="main"
            tabIndex={-1}
            className="flex w-full flex-col gap-5 px-4 pb-16 pt-4 outline-none sm:px-6 sm:pt-5"
          >
            {me.isLoading ? (
              <Card className="space-y-3 p-6" aria-busy>
                <Skeleton className="h-7 w-56" />
                <Skeleton className="h-4 w-80 max-w-full" />
              </Card>
            ) : me.error ? (
              <Card>
                <ErrorState error={me.error} onRetry={() => me.refetch()} title="Couldn’t sign you in" />
              </Card>
            ) : !me.data?.user ? (
              <NoAccess email={me.data?.email ?? ''} />
            ) : (
              <Outlet />
            )}
          </main>
        </div>
      </div>
      <ScrollRestoration />
    </SidebarContext.Provider>
  );
}
