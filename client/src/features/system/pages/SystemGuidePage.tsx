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
/** Not secret: identifies the Cloudflare account (npx wrangler whoami). */
const ACCOUNT_ID = '39dd56665e13d971deae944b75431f65';

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

/** One row per key: name, what it is for, where to find it, what to do if lost. */
function KeyTable({ rows }: { rows: { name: string; what: string; where: ReactNode; note?: string }[] }) {
  return (
    <div className="grid gap-2.5">
      {rows.map(r => (
        <div key={r.name} className="rounded-lg border p-3 text-[13px]">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-mono text-[12.5px] font-semibold">{r.name}</span>
            <span className="text-muted-foreground">{r.what}</span>
          </div>
          <div className="mt-1">
            <span className="text-muted-foreground">Where: </span>
            {r.where}
          </div>
          {r.note && <div className="mt-1 text-xs text-muted-foreground">{r.note}</div>}
        </div>
      ))}
    </div>
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
        description="How this portal is built, where every key lives, and how to work on it from a new computer. Admins only."
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
          title="Keys and where to find them"
          description="No key is in the code or in GitHub's files. Where each one is, and how to change it."
        >
          <KeyTable
            rows={[
              {
                name: 'ENCRYPTION_KEY',
                what: 'Locks the passwords and keys saved in projects.',
                where: (
                  <>
                    Cloudflare dashboard →{' '}
                    <b>Workers &amp; Pages → {WORKER_NAME} → Settings → Variables and Secrets</b>. Cloudflare
                    shows that it exists, never the value.
                  </>
                ),
                note: 'The value was shown once, in the terminal, by "npm run gen:key". Only the person who ran it has it. Without it, saved project passwords cannot be read — never replace it without the key-rotation steps (docs/OPERATIONS.md).'
              },
              {
                name: 'BREVO_API_KEY',
                what: 'Lets the portal send email.',
                where: (
                  <>
                    Brevo → profile menu → <b>SMTP &amp; API → API keys</b> (key named <b>portal</b>, starts
                    with {code('xkeysib-')}). Stored in Cloudflare in the same place as ENCRYPTION_KEY.
                  </>
                ),
                note: 'Lost or leaked: generate a new key in Brevo, store it with the command below, delete the old one.'
              },
              {
                name: 'CLOUDFLARE_API_TOKEN',
                what: 'Lets GitHub deploy the API on every push.',
                where: (
                  <>
                    Created in Cloudflare → profile icon → <b>My Profile → API Tokens</b> (“GitHub deploy
                    (portal)”). Stored in GitHub → repository →{' '}
                    <b>Settings → Secrets and variables → Actions</b>.
                  </>
                ),
                note: 'Lost: roll it in Cloudflare and paste the new value into the GitHub secret.'
              },
              {
                name: 'CLOUDFLARE_ACCOUNT_ID',
                what: 'Which Cloudflare account to deploy to (not secret).',
                where: (
                  <>
                    {code(ACCOUNT_ID)} — also shown by {code('npx wrangler whoami')}. Stored in the same
                    GitHub page as the token.
                  </>
                )
              },
              {
                name: 'Backup key file',
                what: 'Opens the weekly encrypted backups.',
                where: (
                  <>
                    The file made by {code('npm run backup:keygen')} on the admin’s computer (e.g.{' '}
                    {code('D:\\safe\\dsol-backup-key.txt')}). Its public half is in the repository:{' '}
                    {code('backup/age-recipient.txt')}.
                  </>
                ),
                note: 'Never upload it anywhere. Without it, backups cannot be opened.'
              },
              {
                name: 'Admin passwords',
                what: 'Each person’s portal sign-in.',
                where: (
                  <>
                    Not stored anywhere readable (only a one-way hash). Forgotten: <b>Forgot password?</b> on
                    the sign-in page.
                  </>
                )
              }
            ]}
          />
          <p className="text-[13px] text-muted-foreground">
            Other (not secret) settings: app address, email sender, API address →{' '}
            {code('server/wrangler.toml')} ({code('[env.production.vars]')}) and {code('netlify.toml')}.
          </p>
          <p className="text-[13px] text-muted-foreground">Replace a key (the new value applies at once):</p>
          <Cmd>{'cd server\nnpx wrangler secret put BREVO_API_KEY --env production'}</Cmd>
        </Section>

        <Section
          step={4}
          title="Work on it from a new computer"
          description="For you or the next admin. Everything is already set up — this connects a computer to it."
        >
          <Steps
            items={[
              {
                text: (
                  <>
                    Get access (an existing Admin does this): GitHub → repository →{' '}
                    <b>Settings → Collaborators</b>; Cloudflare → <b>Manage Account → Members</b> (role
                    Administrator); Netlify → <b>Team settings → Members</b>; Brevo → <b>Settings → Users</b>;
                    portal → <b>Team &amp; Permissions → Invite user</b> (role Admin).
                  </>
                )
              },
              {
                text: 'Install Node.js 22 (nodejs.org) and Git (git-scm.com). Then get the code:',
                cmds: [`git clone ${REPO}.git\ncd D-Solutions-Business-Portal\nnpm install`]
              },
              {
                text: 'Connect to Cloudflare — a browser opens, sign in, click Authorize. The account must show the Account ID above:',
                cmds: ['npx wrangler login\nnpx wrangler whoami']
              },
              {
                text: 'Optional — run it locally to try changes (an empty test database on your computer):',
                cmds: [
                  'copy server\\.dev.vars.example server\\.dev.vars    # then fill it in\nnpm run gen:key                                    # paste into ENCRYPTION_KEY in server\\.dev.vars\nnpm run db:migrate:local\nnpm run db:seed\nnpm run dev                                        # http://localhost:5173'
                ]
              },
              {
                text: 'Ship a change: commit and push. GitHub tests and deploys the API; Netlify rebuilds the app.',
                cmds: ['git add -A\ngit commit -m "What changed"\ngit push']
              },
              {
                text: 'Or deploy the API from this computer (database changes + API):',
                cmds: ['npm run deploy:prod']
              },
              {
                text: (
                  <>
                    Check: <b>Live status</b> above shows the new version, and the health page answers{' '}
                    {code('"ok":true')}.
                  </>
                )
              }
            ]}
          />
          <p className="text-[13px] text-muted-foreground">
            Building a completely new copy (new accounts, new database): follow docs/DEPLOY.md in the
            repository.
          </p>
        </Section>

        <Section step={5} title="Everyday tasks" description="Updates, database, backups, passwords.">
          <Steps
            items={[
              {
                text: 'See the API logs: Cloudflare → Workers & Pages → dsol-portal-api → Logs.'
              },
              {
                text: 'See the database: Cloudflare → Storage & Databases → D1 → dsol-portal-prod (Console tab runs SQL).'
              },
              {
                text: 'Backups run every Monday: GitHub → Actions → Backup (kept 90 days; download one a month). Restore a copy on your computer to check it:',
                cmds: [
                  'npm run restore -- --local --file <backup>.sql.age --identity <backup key file> --counts <counts>.json'
                ]
              },
              {
                text: 'Undo a mistake from the last 7 days (D1 Time Travel — tell the team first):',
                cmds: [
                  'cd server\nnpx wrangler d1 time-travel restore DB --env production --timestamp "2026-10-19T08:00:00Z"'
                ]
              },
              {
                text: 'Someone forgot their password: "Forgot password?" on the sign-in page, or Team & Permissions → ⋯ → Email a password link.'
              }
            ]}
          />
        </Section>

        <Section
          step={6}
          title="Handing over to a new admin"
          description="What to give them, and what to change when someone leaves."
        >
          <Steps
            items={[
              { text: 'Give them access — step 1 of “Work on it from a new computer”.' },
              {
                text: 'Give them the values that exist only with the current admin: the ENCRYPTION_KEY and the backup key file (see “Keys and where to find them”).'
              },
              {
                text: 'When an admin leaves: Team & Permissions → ⋯ → Deactivate; remove them from GitHub, Cloudflare, Netlify and Brevo; create a new Brevo key and a new Cloudflare API token.'
              }
            ]}
          />
        </Section>
      </Card>
    </>
  );
}
