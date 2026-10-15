import { createBrowserRouter, Navigate, Outlet, type RouteObject } from 'react-router';
import type { RouteHandle } from './layout/crumbs';
import { AppShell } from './layout/AppShell';
import { lazyPage } from './lazyPage';
import { RequirePermission } from './RequirePermission';
import { NotFoundPage } from './NotFoundPage';
import { ClientCrumb, ProjectCrumb } from './RecordCrumbs';
import { RouteError } from './RouteError';

const crumb = (c: RouteHandle['crumb']): RouteHandle => ({ crumb: c });

/*
 * Every page is its own chunk, downloaded on first visit, with a skeleton of the page meanwhile.
 * The shell (sidebar, top bar, router, query client) stays in the main bundle.
 */
/** Public pages (no sign-in): sign in, forgot / reset password. */
const publicPage = {
  login: lazyPage(
    () => import('@/features/auth/pages/LoginPage'),
    m => m.LoginPage,
    'form'
  ),
  forgot: lazyPage(
    () => import('@/features/auth/pages/ForgotPasswordPage'),
    m => m.ForgotPasswordPage,
    'form'
  ),
  reset: lazyPage(
    () => import('@/features/auth/pages/ResetPasswordPage'),
    m => m.ResetPasswordPage,
    'form'
  )
};

const page = {
  dashboard: lazyPage(
    () => import('@/features/dashboard/pages/DashboardPage'),
    m => m.DashboardPage,
    'blank'
  ),
  notifications: lazyPage(
    () => import('@/features/notifications/pages/NotificationsPage'),
    m => m.NotificationsPage,
    'tabs'
  ),
  reports: lazyPage(
    () => import('@/features/reports/pages/ReportsPage'),
    m => m.ReportsPage,
    'list'
  ),
  clients: lazyPage(
    () => import('@/features/clients/pages/ClientsListPage'),
    m => m.ClientsListPage,
    'list'
  ),
  clientForm: lazyPage(
    () => import('@/features/clients/pages/ClientFormPage'),
    m => m.ClientFormPage,
    'form'
  ),
  client: lazyPage(
    () => import('@/features/clients/pages/ClientDetailPage'),
    m => m.ClientDetailPage,
    'detail'
  ),
  projects: lazyPage(
    () => import('@/features/projects/pages/ProjectsListPage'),
    m => m.ProjectsListPage,
    'list'
  ),
  projectForm: lazyPage(
    () => import('@/features/projects/pages/ProjectFormPage'),
    m => m.ProjectFormPage,
    'form'
  ),
  project: lazyPage(
    () => import('@/features/projects/pages/ProjectDetailPage'),
    m => m.ProjectDetailPage,
    'detail'
  ),
  releases: lazyPage(
    () => import('@/features/releases/pages/ReleasesPage'),
    m => m.ReleasesPage,
    'list'
  ),
  work: lazyPage(
    () => import('@/features/work/pages/BillableWorkPage'),
    m => m.BillableWorkPage,
    'list'
  ),
  invoices: lazyPage(
    () => import('@/features/invoices/pages/InvoicesListPage'),
    m => m.InvoicesListPage,
    'list'
  ),
  invoiceEditor: lazyPage(
    () => import('@/features/invoices/pages/InvoiceEditorPage'),
    m => m.InvoiceEditorPage,
    'form'
  ),
  invoice: lazyPage(
    () => import('@/features/invoices/pages/InvoiceDetailPage'),
    m => m.InvoiceDetailPage,
    'detail'
  ),
  payments: lazyPage(
    () => import('@/features/payments/pages/PaymentsPage'),
    m => m.PaymentsPage,
    'list'
  ),
  email: lazyPage(
    () => import('@/features/email/pages/EmailCenterPage'),
    m => m.EmailCenterPage,
    'tabs'
  ),
  compose: lazyPage(
    () => import('@/features/email/pages/ComposePage'),
    m => m.ComposePage,
    'form'
  ),
  templates: lazyPage(
    () => import('@/features/email/pages/TemplatesPage'),
    m => m.TemplatesPage,
    'tabs'
  ),
  team: lazyPage(
    () => import('@/features/team/pages/TeamPage'),
    m => m.TeamPage,
    'tabs'
  ),
  settings: lazyPage(
    () => import('@/features/settings/pages/SettingsPage'),
    m => m.SettingsPage,
    'tabs'
  ),
  system: lazyPage(
    () => import('@/features/system/pages/SystemGuidePage'),
    m => m.SystemGuidePage,
    'form'
  )
};

/**
 * Every screen. `handle.crumb` builds the breadcrumb trail (Dashboard › Clients › …).
 * Detail crumbs show the record's name (from the same cached query as the page).
 */
const screens: RouteObject[] = [
  { path: 'dashboard', element: page.dashboard },
  { path: 'notifications', element: page.notifications, handle: crumb('Notifications') },
  {
    path: 'reports',
    element: <RequirePermission permission="reports.read">{page.reports}</RequirePermission>,
    handle: crumb('Reports')
  },
  {
    path: 'clients',
    handle: crumb('Clients'),
    children: [
      { index: true, element: page.clients },
      {
        path: 'new',
        element: <RequirePermission permission="clients.write">{page.clientForm}</RequirePermission>,
        handle: crumb('Add client')
      },
      {
        path: ':clientId',
        handle: crumb(m => <ClientCrumb id={m.params.clientId!} />),
        children: [
          { index: true, element: page.client },
          {
            path: 'edit',
            element: <RequirePermission permission="clients.write">{page.clientForm}</RequirePermission>,
            handle: crumb('Edit')
          }
        ]
      }
    ]
  },
  {
    path: 'projects',
    handle: crumb('Projects'),
    children: [
      { index: true, element: page.projects },
      {
        path: 'new',
        element: <RequirePermission permission="projects.write">{page.projectForm}</RequirePermission>,
        handle: crumb('New project')
      },
      {
        path: ':projectId',
        handle: crumb(m => <ProjectCrumb id={m.params.projectId!} />),
        children: [
          { index: true, element: page.project },
          {
            path: 'edit',
            element: <RequirePermission permission="projects.write">{page.projectForm}</RequirePermission>,
            handle: crumb('Edit')
          }
        ]
      }
    ]
  },
  { path: 'releases', element: page.releases, handle: crumb('Releases') },
  { path: 'work', element: page.work, handle: crumb('Billable work') },
  {
    path: 'invoices',
    handle: crumb('Invoices'),
    element: (
      <RequirePermission permission="invoices.read">
        <Outlet />
      </RequirePermission>
    ),
    children: [
      { index: true, element: page.invoices },
      { path: 'new', element: page.invoiceEditor, handle: crumb('Create invoice') },
      {
        path: ':invoiceNo',
        handle: crumb(m => m.params.invoiceNo),
        children: [
          { index: true, element: page.invoice },
          { path: 'edit', element: page.invoiceEditor, handle: crumb('Edit draft') }
        ]
      }
    ]
  },
  {
    path: 'payments',
    element: <RequirePermission permission="payments.read">{page.payments}</RequirePermission>,
    handle: crumb('Payments')
  },
  {
    path: 'email',
    handle: crumb('Email Center'),
    children: [
      { index: true, element: page.email },
      { path: 'compose', element: page.compose, handle: crumb('Compose') },
      { path: 'templates', element: page.templates, handle: crumb('Templates') }
    ]
  },
  { path: 'team', element: page.team, handle: crumb('Team & Permissions') },
  { path: 'settings', element: page.settings, handle: crumb('Settings') },
  {
    // Admins only (team.manage can't be given to custom roles)
    path: 'system',
    element: <RequirePermission permission="team.manage">{page.system}</RequirePermission>,
    handle: crumb('System guide')
  },
  { path: '*', element: <NotFoundPage />, handle: crumb('Not found') }
];

export const router = createBrowserRouter([
  // no landing page: the sign-in page sends people who are already signed in on to the dashboard
  { path: '/', element: <Navigate to="/login" replace /> },
  { path: '/login', element: publicPage.login, errorElement: <RouteError /> },
  { path: '/forgot-password', element: publicPage.forgot, errorElement: <RouteError /> },
  { path: '/reset-password', element: publicPage.reset, errorElement: <RouteError /> },
  {
    // the signed-in app: sidebar + top bar around every screen
    element: <AppShell />,
    handle: { crumb: 'Dashboard', crumbTo: '/dashboard' } satisfies RouteHandle,
    // Pathless layer so render errors show inside the shell, with navigation still usable.
    children: [{ element: <Outlet />, errorElement: <RouteError />, children: screens }]
  }
]);
