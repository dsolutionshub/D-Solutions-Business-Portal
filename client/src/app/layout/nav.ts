import {
  BarChart3,
  Bell,
  Briefcase,
  CreditCard,
  FilePlus2,
  FileText,
  LayoutDashboard,
  Mail,
  Rocket,
  Settings,
  ShieldCheck,
  Users,
  type LucideIcon
} from 'lucide-react';
import type { Permission } from '@dsol/shared';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Hidden from roles without this permission. */
  permission?: Permission;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

/** Sidebar menu, in groups. */
export const NAV: NavGroup[] = [
  {
    title: 'Overview',
    items: [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }]
  },
  {
    title: 'Work',
    items: [
      { to: '/clients', label: 'Clients', icon: Users },
      { to: '/projects', label: 'Projects', icon: Briefcase },
      { to: '/releases', label: 'Releases', icon: Rocket }
    ]
  },
  {
    title: 'Billing',
    items: [
      { to: '/work', label: 'Billable work', icon: FilePlus2 },
      { to: '/invoices', label: 'Invoices', icon: FileText, permission: 'invoices.read' },
      { to: '/payments', label: 'Payments', icon: CreditCard, permission: 'payments.read' }
    ]
  },
  {
    title: 'Communication',
    items: [{ to: '/email', label: 'Email Center', icon: Mail, permission: 'emails.read' }]
  },
  {
    title: 'Insights',
    items: [
      { to: '/notifications', label: 'Notifications', icon: Bell },
      { to: '/reports', label: 'Reports', icon: BarChart3, permission: 'reports.read' }
    ]
  },
  {
    title: 'Admin',
    items: [
      { to: '/team', label: 'Team & Permissions', icon: ShieldCheck, permission: 'team.read' },
      { to: '/settings', label: 'Settings', icon: Settings, permission: 'settings.read' }
    ]
  }
];
