import { KeyRound, LogOut, Menu, Moon, Settings, Sun } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useLogout } from '@/features/auth/api';
import { BellMenu } from '@/features/notifications/components/BellMenu';
import { useMe } from '@/lib/auth';
import { initials } from '@/lib/format';
import { useTheme } from '../theme/useTheme';
import { useSidebar } from './useSidebar';

/** Loaded only when opened (it brings the form validation code with it). */
const ChangePasswordDialog = lazy(() =>
  import('@/features/auth/components/ChangePasswordDialog').then(m => ({ default: m.ChangePasswordDialog }))
);

/** Cloudflare Access ends its session at this path (only when Access is in front of the app). */
const ACCESS_LOGOUT = '/cdn-cgi/access/logout';

export function Topbar() {
  const { setMobileOpen } = useSidebar();
  const { resolvedTheme, setTheme } = useTheme();
  const me = useMe();
  const nextTheme = resolvedTheme === 'dark' ? 'light' : 'dark';
  const ThemeIcon = resolvedTheme === 'dark' ? Sun : Moon;
  const displayName = me.data?.user?.name ?? me.data?.email ?? '';
  const navigate = useNavigate();
  const logout = useLogout();
  const [changingPassword, setChangingPassword] = useState(false);

  /** End the portal session; if Cloudflare Access is in front, end that session too. */
  const signOut = async () => {
    const via = me.data?.via;
    await logout.mutateAsync().catch(() => undefined);
    if (via === 'access') window.location.assign(ACCESS_LOGOUT);
    else navigate('/login', { replace: true });
  };

  return (
    <header className="sticky top-0 z-30 flex min-h-16 items-center gap-3 border-b bg-card px-4 py-3 sm:px-7">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
      >
        <Menu />
      </Button>

      <div className="min-w-0 flex-1" />

      {me.data?.user && <BellMenu />}

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(nextTheme)}
            aria-label={`Switch to ${nextTheme} theme`}
          >
            <ThemeIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Switch to {nextTheme} theme</TooltipContent>
      </Tooltip>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="gap-2 px-1.5" aria-label="Account menu">
            <span className="flex size-7 items-center justify-center rounded-full bg-slate-700 text-[10px] font-semibold text-white">
              {displayName ? initials(displayName) : '…'}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="font-normal">
            {me.isError ? (
              <span className="text-sm text-destructive">Could not load your account</span>
            ) : (
              <>
                <div className="truncate font-semibold">{me.data?.user?.name ?? 'Signed in'}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {me.data?.email ?? 'Loading…'}
                  {me.data?.user && ` · ${me.data.user.role}`}
                </div>
              </>
            )}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/settings">
              <Settings /> Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setTheme(nextTheme)}>
            <ThemeIcon /> Switch to {nextTheme} theme
          </DropdownMenuItem>
          {me.data?.via === 'password' && (
            <DropdownMenuItem onSelect={() => setChangingPassword(true)}>
              <KeyRound /> Change password
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => void signOut()}
          >
            <LogOut /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {changingPassword && (
        <Suspense fallback={null}>
          <ChangePasswordDialog open={changingPassword} onOpenChange={setChangingPassword} />
        </Suspense>
      )}
    </header>
  );
}
