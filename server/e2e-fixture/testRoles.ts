/**
 * Custom roles the tests use: what the old built-in Manager-level Admin, Developer and Accounts
 * roles allowed.
 * Developers: infrastructure, projects, releases, work — no secrets, no money.
 * Accounts: billing; of a project only cost amounts and due dates.
 */
export const TEST_ROLES: Record<string, string[]> = {
  // everything except the Admin-only permissions (team.manage, cron.run)
  Manager: [
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
    'data.export',
    'cron.read'
  ],
  Developer: [
    'clients.read',
    'clients.write',
    'projects.read',
    'projects.sheet',
    'projects.write',
    'releases.read',
    'releases.write',
    'work.read',
    'work.write',
    'renewals.write',
    'emails.read',
    'emails.send',
    'alerts.read',
    'notices.write',
    'settings.read',
    'team.read'
  ],
  Accounts: [
    'clients.read',
    'projects.read',
    'releases.read',
    'work.read',
    'work.write',
    'invoices.read',
    'invoices.write',
    'invoices.void',
    'payments.read',
    'payments.record',
    'renewals.write',
    'emails.read',
    'emails.send',
    'alerts.read',
    'alerts.digest',
    'reports.read',
    'settings.read',
    'team.read'
  ]
};
