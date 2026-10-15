/**
 * Who may do what. Every signed-in person gets the permission list of their role; the server
 * enforces it (requirePermission) and the app uses the same list to hide what they can't do.
 *
 *   Admin   everything (built in, fixed)
 *   custom  roles an Admin creates, with any permissions except the Admin-only ones
 */
import type { BuiltinRole, Role } from './constants';

export const PERMISSION_KEYS = [
  'clients.read',
  'clients.write',
  'clients.archive',
  'clients.export',
  'projects.read',
  'projects.sheet',
  'projects.write',
  'secrets.reveal',
  'renewals.write',
  'releases.read',
  'releases.write',
  'work.read',
  'work.write',
  'invoices.read',
  'invoices.write',
  'invoices.void',
  'payments.read',
  'payments.record',
  'reports.read',
  'emails.read',
  'emails.send',
  'templates.write',
  'alerts.read',
  'alerts.digest',
  'notices.write',
  'settings.read',
  'settings.write',
  'lists.write',
  'team.read',
  'team.manage',
  'data.export',
  'cron.read',
  'cron.run'
] as const;

export type Permission = (typeof PERMISSION_KEYS)[number];

/** Only Admins: invite people and change roles (incl. creating roles), run the daily job by hand. */
export const ADMIN_ONLY_PERMISSIONS: readonly Permission[] = ['team.manage', 'cron.run'];

/** What a custom role may be given. */
export const ASSIGNABLE_PERMISSIONS: readonly Permission[] = PERMISSION_KEYS.filter(
  p => !ADMIN_ONLY_PERMISSIONS.includes(p)
);

export const BUILTIN_ROLE_PERMISSIONS: Record<BuiltinRole, readonly Permission[]> = {
  Admin: PERMISSION_KEYS
};

export const isBuiltinRole = (role: Role | null | undefined): role is BuiltinRole => role === 'Admin';

/** Does this person (anything carrying a permission list, e.g. the signed-in user) have it? */
export const can = (
  who: { permissions: readonly string[] } | null | undefined,
  permission: Permission
): boolean => !!who && who.permissions.includes(permission);

/** Keep only real, assignable permission keys (stored roles are read through this). */
export const cleanPermissions = (list: readonly unknown[]): Permission[] =>
  ASSIGNABLE_PERMISSIONS.filter(p => list.includes(p));

/** The Role permissions page: what each permission means, grouped. */
export const PERMISSION_GROUPS: { title: string; items: { key: Permission; label: string }[] }[] = [
  {
    title: 'Clients & projects',
    items: [
      { key: 'clients.read', label: 'View clients' },
      { key: 'clients.write', label: 'Add and edit clients and contacts' },
      { key: 'clients.archive', label: 'Archive and restore clients' },
      { key: 'clients.export', label: 'Export client data' },
      { key: 'projects.read', label: 'View projects (cost amounts and due dates)' },
      { key: 'projects.sheet', label: 'View project sheets: URLs, domain, hosting, database, keys' },
      { key: 'projects.write', label: 'Add and edit projects, set secrets' },
      { key: 'secrets.reveal', label: 'Reveal passwords and secret keys' },
      { key: 'renewals.write', label: 'Renew domains, SSL, hosting and subscriptions' }
    ]
  },
  {
    title: 'Releases & billing',
    items: [
      { key: 'releases.read', label: 'View releases' },
      { key: 'releases.write', label: 'Log and edit releases' },
      { key: 'work.read', label: 'View billable work' },
      { key: 'work.write', label: 'Log and price delivered work' },
      { key: 'invoices.read', label: 'View invoices' },
      { key: 'invoices.write', label: 'Create, edit, issue and duplicate invoices' },
      { key: 'invoices.void', label: 'Void invoices' },
      { key: 'payments.read', label: 'View payments' },
      { key: 'payments.record', label: 'Record payments' },
      { key: 'reports.read', label: 'Financial reports and exports' }
    ]
  },
  {
    title: 'Communication',
    items: [
      { key: 'emails.read', label: 'View email history' },
      { key: 'emails.send', label: 'Send emails to client contacts' },
      { key: 'templates.write', label: 'Edit email templates' },
      { key: 'alerts.read', label: 'Notifications inbox' },
      {
        key: 'alerts.digest',
        label:
          'Daily reminder email (invoice reminders with “View invoices”, renewals with “View project sheets”)'
      },
      { key: 'notices.write', label: 'Post notices (e.g. upcoming maintenance)' }
    ]
  },
  {
    title: 'Administration',
    items: [
      { key: 'settings.read', label: 'View company settings' },
      { key: 'settings.write', label: 'Change settings, reminder preferences' },
      { key: 'lists.write', label: 'Edit dropdown lists' },
      { key: 'team.read', label: 'View the team' },
      { key: 'team.manage', label: 'Invite users, change roles, manage roles, deactivate (Admin only)' },
      { key: 'data.export', label: 'Export all data (secrets hidden)' },
      { key: 'cron.read', label: 'View daily reminder runs' },
      { key: 'cron.run', label: 'Run daily reminders now (Admin only)' }
    ]
  }
];
