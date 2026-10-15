import type { SystemInfo } from '@dsol/shared';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { CopyButton } from '@/components/common/CopyButton';
import { ErrorState } from '@/components/common/ErrorState';
import { FormAccordionSection } from '@/components/common/FormAccordion';
import { PageHeader } from '@/components/common/PageHeader';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';

/* Names of this installation's resources (see server/wrangler.toml and netlify.toml). */
const REPO = 'https://github.com/dsolutionshub/D-Solutions-Business-Portal';
const DB_NAME = 'dsol-portal-prod';
const WORKER_NAME = 'dsol-portal-api';

/** A terminal command with a copy button. */
function Cmd({ children }: { children: string }) {
  return (
    <div className="flex items-start gap-1 rounded-lg border bg-surface-2 py-1.5 pl-3 pr-1">
      <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre py-1 font-mono text-[12.5px]">
        {children}
      </pre>
      <CopyButton value={children} label="Command" />
    </div>
  );
}

/** Label / value rows. */
function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(120px,190px)_1fr] gap-x-4 gap-y-2 text-[13px]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Status({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 text-ok">
      <CheckCircle2 className="size-4" /> {yes}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-bad">
      <XCircle className="size-4" /> {no}
    </span>
  );
}

/** Numbered steps; each step is text and optional commands. */
function Steps({ items }: { items: { text: ReactNode; cmds?: string[] }[] }) {
  return (
    <ol className="grid gap-3.5 text-[13px]">
      {items.map((s, i) => (
        <li key={i} className="grid grid-cols-[24px_1fr] gap-2">
          <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary-soft-foreground">
            {i + 1}
          </span>
          <div className="grid min-w-0 gap-1.5 pt-0.5">
            <div>{s.text}</div>
            {s.cmds?.map(c => (
              <Cmd key={c}>{c}</Cmd>
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}

const Section = ({
  step,
  title,
  description,
  open,
  children
}: {
  step: number;
  title: string;
  description: string;
  open?: boolean;
  children: ReactNode;
}) => (
  <FormAccordionSection step={step} title={title} description={description} defaultOpen={open}>
    <div className="col-span-full grid gap-3">{children}</div>
  </FormAccordionSection>
);

const code = (t: string) => <code className="rounded bg-muted px-1 py-0.5 font-mono text-[12px]">{t}</code>;

/**
 * Admins only: how this portal is built and deployed, where every setting and secret lives, and
 * the commands to set it up again — the handover page for the next admin.
 */
export function SystemGuidePage() {
  const info = useQuery({
    queryKey: ['admin', 'system'],
    queryFn: () => api.get<SystemInfo>('/admin/system')
  });
  const s = info.data;

  return (
    <>
      <PageHeader
        title="System guide"
        description="How this portal is built, where everything lives, and how to set it up again. Admins only."
      />
      <Card>
        <Section step={1} title="Live status" description="This installation right now." open>
          {info.error ? (
            <ErrorState error={info.error} onRetry={() => info.refetch()} />
          ) : !s ? (
            <Skeleton className="h-40" />
          ) : (
            <Rows
              rows={[
                ['App (what people open)', s.appUrl ?? '—'],
                ['API (backend)', s.apiUrl],
                ['Version', `${s.version} · ${s.environment}`],
                [
                  'Database',
                  `${s.environment === 'production' ? DB_NAME : 'local database'} · ${s.database.tables} tables · ${s.database.activeUsers} active users`
                ],
                [
                  'Encryption key',
                  <Status
                    key="e"
                    ok={s.secrets.encryptionKey}
                    yes="Set"
                    no="Missing — project secrets can't be saved"
                  />
                ],
                [
                  'Brevo API key',
                  <Status key="b" ok={s.secrets.brevoApiKey} yes="Set" no="Missing — no emails are sent" />
                ],
                ['Email sender', s.emailFrom],
                [
                  'Daily reminders',
                  <Status
                    key="d"
                    ok={s.dailyJob === 'ok' || s.dailyJob === 'never'}
                    yes={s.dailyJob === 'ok' ? 'Running' : 'Not run yet (runs 08:00 IST)'}
                    no={s.dailyJob === 'stale' ? 'Missed a day' : 'Last run failed'}
                  />
                ],
                ['Password hashing', `PBKDF2, ${s.passwordHashRounds.toLocaleString('en-IN')} rounds`]
              ]}
            />
          )}
        </Section>

        <Section step={2} title="Technology" description="What each part is built with and where it runs.">
          <Rows
            rows={[
              [
                'Front end',
                'React 18 + TypeScript, Vite, Tailwind CSS, shadcn/ui, React Router, TanStack Query'
              ],
              ['Hosting (front end)', 'Netlify — builds from GitHub on every push to main (netlify.toml)'],
              [
                'Back end (API)',
                `Hono on a Cloudflare Worker (${WORKER_NAME}) — also runs the daily reminders`
              ],
              [
                'Database',
                `Cloudflare D1 (SQLite) — ${DB_NAME}, region APAC; Drizzle ORM; migrations in server/migrations`
              ],
              ['Email', 'Brevo (transactional API) — free plan, 300 emails a day'],
              ['Code', REPO],
              ['Tests', 'Vitest (unit + API), Playwright (browser); GitHub Actions runs them on every push']
            ]}
          />
          <p className="text-[13px] text-muted-foreground">
            How a request flows: browser → Netlify (the app) → {code('/api/*')} is forwarded to the Cloudflare
            Worker → D1 database. People only ever open the Netlify address.
          </p>
        </Section>

        <Section
          step={3}
          title="Where settings and secrets live"
          description="Nothing secret is in the code or in GitHub."
        >
          <Rows
            rows={[
              [
                'ENCRYPTION_KEY',
                'Cloudflare Worker secret. Locks project passwords/keys. Copy in the password manager — lose it and they are unreadable.'
              ],
              [
                'BREVO_API_KEY',
                'Cloudflare Worker secret. Starts with xkeysib-. Brevo → SMTP & API → API keys.'
              ],
              [
                'CLOUDFLARE_API_TOKEN / ACCOUNT_ID',
                'GitHub → Settings → Secrets → Actions. Used to deploy on push.'
              ],
              ['Backup private key', 'Offline only (password manager + USB). Needed to open backups.'],
              ['App address, sender, etc.', `Not secret: server/wrangler.toml → [env.production.vars]`],
              ['API forwarding', 'netlify.toml → the /api/* redirect to the Worker address']
            ]}
          />
          <p className="text-[13px] text-muted-foreground">
            Change a secret (the new value applies at once):
          </p>
          <Cmd>
            {
              'cd server\nnpx wrangler secret put BREVO_API_KEY --env production\nnpx wrangler secret put ENCRYPTION_KEY --env production   # only via the key rotation steps!'
            }
          </Cmd>
        </Section>

        <Section
          step={4}
          title="Set it up on a new system"
          description="From an empty computer and new accounts to a working portal."
        >
          <Steps
            items={[
              {
                text: 'Install Node.js 22 and Git, then get the code:',
                cmds: [`git clone ${REPO}.git\ncd D-Solutions-Business-Portal\nnpm install`]
              },
              {
                text: 'Log in to Cloudflare (free account) and note the Account ID:',
                cmds: ['npx wrangler login\nnpx wrangler whoami']
              },
              {
                text: (
                  <>
                    Create the database and paste the printed {code('database_id')} into server/wrangler.toml:
                  </>
                ),
                cmds: ['npm run setup:prod']
              },
              {
                text: (
                  <>
                    Netlify: <b>Add new site → Import from GitHub</b> → this repository → Deploy. Turn off
                    Visitor access protection. Put the site address in {code('APP_URL')} (wrangler.toml).
                  </>
                )
              },
              {
                text: (
                  <>
                    Brevo: verify a sender email, create an API key (Restricted → transactional email). Put
                    the sender in {code('EMAIL_FROM_ADDRESS')}.
                  </>
                )
              },
              {
                text: 'Store the secrets (save the generated key in your password manager first):',
                cmds: [
                  'npm run gen:key\ncd server\nnpx wrangler secret put ENCRYPTION_KEY --env production\nnpx wrangler secret put BREVO_API_KEY --env production\ncd ..'
                ]
              },
              {
                text: (
                  <>
                    Create the tables and deploy the API. Put the printed Worker address into{' '}
                    {code('netlify.toml')}, then commit and push:
                  </>
                ),
                cmds: ['npm run deploy:prod', 'git add -A\ngit commit -m "Configure production"\ngit push']
              },
              {
                text: 'Create the first Admin; open the printed link and choose a password:',
                cmds: [
                  'npm run first-run -- --env production --owner you@example.com --name "Your Name" --company "D Solutions"'
                ]
              },
              {
                text: (
                  <>
                    GitHub → Settings → Secrets → Actions: add {code('CLOUDFLARE_API_TOKEN')} and{' '}
                    {code('CLOUDFLARE_ACCOUNT_ID')}. From then on every push to main deploys.
                  </>
                )
              }
            ]}
          />
          <p className="text-[13px] text-muted-foreground">
            Full click-by-click version: docs/DEPLOY.md in the repository.
          </p>
        </Section>

        <Section step={5} title="Everyday tasks" description="Updates, database, backups, passwords.">
          <Steps
            items={[
              {
                text: 'Ship a change: commit and push to main. GitHub tests it, updates the database and API; Netlify rebuilds the app.',
                cmds: ['git push']
              },
              { text: 'Deploy the API by hand (if GitHub is down):', cmds: ['npm run deploy:prod'] },
              { text: 'See the API logs: Cloudflare → Workers & Pages → dsol-portal-api → Logs.' },
              {
                text: 'Backups run every Monday (GitHub → Actions → Backup, kept 90 days). Download one a month. Restore:',
                cmds: [
                  'npm run restore -- --local --file <backup>.sql.age --identity <key file> --counts <counts>.json'
                ]
              },
              {
                text: 'Undo a mistake from the last 7 days (D1 Time Travel):',
                cmds: [
                  'cd server\nnpx wrangler d1 time-travel restore DB --env production --timestamp "2026-10-19T08:00:00Z"'
                ]
              },
              {
                text: 'Someone forgot their password: they use "Forgot password?", or Team & Permissions → ⋯ → Email a password link.'
              },
              {
                text: 'All Admins locked out: create a fresh set-password link from a terminal:',
                cmds: ['npm run first-run -- --env production --owner <admin email> --name "<name>"']
              }
            ]}
          />
        </Section>

        <Section
          step={6}
          title="Handing over to a new admin"
          description="What to pass on, and what to change."
        >
          <Steps
            items={[
              {
                text: 'Invite them (Team & Permissions → Invite user, role Admin). Keep at least one other Admin.'
              },
              {
                text: 'Give access: GitHub repository, Cloudflare account (Manage Account → Members), Netlify team, Brevo account.'
              },
              {
                text: 'Hand over the password-manager entries: ENCRYPTION_KEY, Brevo key, backup private key.'
              },
              {
                text: 'When the previous admin leaves: deactivate them, remove their dashboard access, and create a new Brevo key and Cloudflare API token.'
              }
            ]}
          />
        </Section>
      </Card>
    </>
  );
}
