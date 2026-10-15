import { FileText, KeyRound, ShieldCheck } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Logo } from '@/components/common/Logo';
import { ThemeToggle } from './ThemeToggle';

const POINTS = [
  { icon: KeyRound, text: 'Project secrets encrypted, revealed only to roles allowed to see them' },
  { icon: FileText, text: 'Releases, billable work, invoices and payments in one flow' },
  { icon: ShieldCheck, text: 'Roles decide who sees and changes what' }
];

/** Sign-in screens: one centred card — brand content on the left (wide screens), the form on the right. */
export function AuthLayout({
  title,
  description,
  children
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    document.title = `${title} · D Solutions Portal`;
  }, [title]);

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_100%_at_50%_0%,hsl(var(--primary)/0.14),transparent)]"
      />
      <div className="relative flex justify-end px-4 py-4 sm:px-8">
        <ThemeToggle />
      </div>

      <main className="relative flex flex-1 items-start justify-center px-4 pb-12 sm:items-center">
        <div className="flex w-full max-w-[1040px] overflow-hidden rounded-3xl border bg-card shadow-[0_8px_40px_-12px_hsl(var(--primary)/0.25)] lg:min-h-[600px]">
          <aside className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-[linear-gradient(155deg,#312e81_0%,#4338ca_45%,#4f46e5_100%)] p-10 text-white lg:flex">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-white/10 blur-2xl"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-32 -left-16 size-96 rounded-full bg-indigo-300/20 blur-3xl"
            />
            <Link to="/login" className="relative w-fit" aria-label="D Solutions Business Portal">
              <Logo size={40} inverted />
            </Link>
            <div className="relative">
              <h2 className="text-[28px] font-semibold leading-tight tracking-tight">
                Everything about your clients, in one place.
              </h2>
              <ul className="mt-7 space-y-4">
                {POINTS.map(p => (
                  <li key={p.text} className="flex items-start gap-3 text-[15px] text-indigo-50">
                    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-white/15">
                      <p.icon className="size-4" />
                    </span>
                    {p.text}
                  </li>
                ))}
              </ul>
            </div>
            <p className="relative text-xs text-indigo-100">
              Internal tool · staff only · clients never sign in here
            </p>
          </aside>

          <section className="flex flex-1 flex-col justify-center px-6 py-10 sm:px-12 lg:px-14">
            <Link to="/login" className="mb-8 w-fit lg:hidden" aria-label="D Solutions Business Portal">
              <Logo size={36} />
            </Link>
            <div className="mx-auto w-full max-w-[400px]">
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              {description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
              <div className="mt-7">{children}</div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
