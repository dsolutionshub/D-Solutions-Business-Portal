import type { Me } from '@dsol/shared';
import { Hono } from 'hono';
import { DAILY_CRON, runDaily, runScheduledEmails } from './cron/daily';
import type { AppEnv, Env } from './env';
import { auth, requireUser, sameOriginWrites, touchLastLogin } from './middleware/auth';
import { errorHandler, notFound } from './middleware/errorHandler';
import {
  corsIfConfigured,
  limitBody,
  rateLimitMutations,
  requestLog,
  securityHeaders
} from './middleware/hardening';
import admin from './routes/admin';
import { account, authPublic } from './routes/auth';
import clients from './routes/clients';
import contacts from './routes/contacts';
import emails from './routes/emails';
import health from './routes/health';
import invoices from './routes/invoices';
import lists from './routes/lists';
import { alerts, notices, prefs } from './routes/notifications';
import payments from './routes/payments';
import projects from './routes/projects';
import projectSecrets from './routes/projectSecrets';
import publicPages from './routes/public';
import releases from './routes/releases';
import { projectRenewalRoutes, renewals } from './routes/renewals';
import reports from './routes/reports';
import settings from './routes/settings';
import templates from './routes/templates';
import users from './routes/users';
import roles from './routes/roles';
import work from './routes/work';

export const app = new Hono<AppEnv>().basePath('/api');

// Request id + JSON log line, security headers (incl. no-store), CORS only if configured, body size.
app.use('*', requestLog, securityHeaders, corsIfConfigured, limitBody, sameOriginWrites);

// Uptime checks: no sign-in, no data (see routes/health.ts).
app.route('/health', health);
// Sign in / out, forgot and reset password — before the sign-in check.
app.route('/auth', authPublic);
// Signed invoice / receipt links from emails — no sign-in (see services/links.ts).
app.route('/public', publicPages);

app.use('*', auth);
/** Answers for any signed-in email, so the app can show "no access" for unknown ones. */
app.get('/me', async c => {
  const user = c.get('user');
  if (user) await touchLastLogin(c.get('db'), user.id);
  return c.json<Me>({ email: c.get('email'), user, via: c.get('via') });
});
app.use('*', requireUser, rateLimitMutations);

app.route('/account', account);
app.route('/clients', clients);
app.route('/contacts', contacts);
app.route('/projects', projects);
app.route('/projects', projectSecrets);
app.route('/projects', projectRenewalRoutes);
app.route('/renewals', renewals);
app.route('/lists', lists);
app.route('/releases', releases);
app.route('/work', work);
app.route('/invoices', invoices);
app.route('/payments', payments);
app.route('/emails', emails);
app.route('/templates', templates);
app.route('/alerts', alerts);
app.route('/notices', notices);
app.route('/notification-prefs', prefs);
app.route('/reports', reports);
app.route('/settings', settings);
app.route('/users', users);
app.route('/roles', roles);
app.route('/admin', admin);

app.notFound(notFound);
app.onError(errorHandler);

export default {
  fetch: app.fetch,
  scheduled(event, env, ctx) {
    ctx.waitUntil(
      event.cron === DAILY_CRON ? runDaily(env, { trigger: 'schedule' }) : runScheduledEmails(env)
    );
  }
} satisfies ExportedHandler<Env>;
