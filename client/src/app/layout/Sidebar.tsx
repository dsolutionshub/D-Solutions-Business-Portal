import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { NavLink, useMatch, useResolvedPath } from 'react-router';
import { Logo, LogoMark } from '@/components/common/Logo';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useMe } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { can } from '@dsol/shared';
import { NAV, type NavItem } from './nav';
import { useSidebar } from './useSidebar';

const itemClass = (active: boolean, collapsed: boolean) =>
  cn(
    'flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors',
    collapsed && 'justify-center px-0',
    active
      ? 'bg-primary-soft font-semibold text-primary-soft-foreground'
      : 'text-subtle-foreground hover:bg-accent hover:text-foreground'
  );

function SidebarLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  // a plain className (not NavLink's function form): the tooltip trigger merges classNames and
  // would drop a function, leaving the collapsed icons unstyled and out of line
  const active = !!useMatch({ path: useResolvedPath(item.to).pathname, end: false });
  const link = (
    <NavLink to={item.to} className={itemClass(active, collapsed)}>
      <item.icon className="size-[17px] flex-none" aria-hidden />
      <span className={cn('flex-1 truncate', collapsed && 'sr-only')}>{item.label}</span>
    </NavLink>
  );
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  const { setCollapsed } = useSidebar();
  const Toggle = collapsed ? PanelLeftOpen : PanelLeftClose;
  const user = useMe().data?.user;
  const groups = NAV.map(g => ({
    ...g,
    items: g.items.filter(i => !i.permission || can(user, i.permission))
  })).filter(g => g.items.length);

  return (
    <div className="flex h-full flex-col overflow-y-auto px-2.5 pb-3 pt-3.5">
      <div className={cn('flex items-center gap-2.5 px-1.5 pb-4', collapsed && 'justify-center px-0')}>
        {collapsed ? <LogoMark size={34} /> : <Logo size={34} />}
      </div>

      <nav className="flex flex-col gap-2.5">
        {groups.map(group => (
          <div key={group.title} className="flex flex-col gap-0.5">
            {collapsed ? (
              <div className="mx-2 my-1 border-t first:hidden" aria-hidden />
            ) : (
              <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.title}
              </div>
            )}
            {group.items.map(item => (
              <SidebarLink key={item.to} item={item} collapsed={collapsed} />
            ))}
          </div>
        ))}
      </nav>

      <div className="mt-auto hidden border-t pt-2 lg:block">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className={itemClass(false, collapsed)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <Toggle className="size-[17px] flex-none" aria-hidden />
          {!collapsed && <span className="flex-1 text-left">Collapse sidebar</span>}
        </button>
      </div>
    </div>
  );
}
