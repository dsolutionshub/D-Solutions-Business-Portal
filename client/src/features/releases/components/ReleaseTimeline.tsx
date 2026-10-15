import { formatDate, type ReleaseView } from '@dsol/shared';
import type { ReactNode } from 'react';

const DOT: Record<string, string> = {
  Deployed: 'bg-ok',
  'In QA': 'bg-purple',
  Scheduled: 'bg-info',
  Failed: 'bg-bad',
  'Rolled back': 'bg-warn',
  Draft: 'bg-muted-foreground'
};

/** Releases as a timeline; click a release to see its features, fixes and known issues. */
export function ReleaseTimeline({
  releases,
  open,
  onToggle,
  actions
}: {
  releases: ReleaseView[];
  open: Set<string>;
  onToggle: (id: string) => void;
  actions: (r: ReleaseView) => ReactNode;
}) {
  return (
    <ol className="relative ml-1 border-l-2 border-border pl-5">
      {releases.map(r => {
        const expanded = open.has(r.id);
        return (
          <li key={r.id} className="relative pb-5 last:pb-0">
            <span
              className={`absolute -left-[27px] top-1 size-3 rounded-full ring-2 ring-card ${DOT[r.status] ?? 'bg-muted'}`}
              aria-hidden
            />
            <button
              type="button"
              onClick={() => onToggle(r.id)}
              aria-expanded={expanded}
              className="flex w-full flex-wrap items-center gap-2 text-left"
            >
              <span className="font-mono font-semibold">{r.version}</span>
              <span className="font-semibold">{r.projectName}</span>
              <span className="text-xs text-muted-foreground">{r.clientName}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {formatDate(r.releaseDate)} · {r.releasedByName ?? '—'}
              </span>
            </button>
            {expanded && (
              <div className="mt-2.5 grid gap-3 rounded-lg border bg-surface-2 p-3.5 text-[13px] [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
                {(
                  [
                    ['Features', r.features],
                    ['Bug fixes', r.fixes],
                    ['Known issues', r.issues]
                  ] as const
                ).map(([t, items]) => (
                  <div key={t}>
                    <div className="mb-1 text-xs font-semibold">{t}</div>
                    {items.length ? (
                      items.map(x => (
                        <div key={x} className="text-subtle-foreground">
                          • {x}
                        </div>
                      ))
                    ) : (
                      <div className="text-muted-foreground">—</div>
                    )}
                  </div>
                ))}
                <div className="col-span-full flex flex-wrap gap-2">{actions(r)}</div>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
