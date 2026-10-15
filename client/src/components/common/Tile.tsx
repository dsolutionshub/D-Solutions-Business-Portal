import type { ReactNode } from 'react';

/** A labelled value tile (project summary, client stats inside a card). */
export function Tile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border px-3.5 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 break-words font-semibold">{children}</div>
    </div>
  );
}
