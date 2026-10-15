import { ENV_NAMES, formatDate, type ReleaseView } from '@dsol/shared';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';

/** The release in plain text — what "Copy as text" puts on the clipboard (same as the API's notes.txt). */
function releaseNotesText(r: ReleaseView) {
  const list = (items: string[]) => (items.length ? items.map(x => `- ${x}`).join('\n') : '- None');
  return `${r.projectName} ${r.version}\n${r.clientName} · ${ENV_NAMES[r.environment] ?? r.environment} · ${formatDate(r.releaseDate)}\n\nNew features:\n${list(r.features)}\n\nBug fixes:\n${list(r.fixes)}\n\nKnown issues:\n${list(r.issues)}\n`;
}

function NotesBody({ r }: { r: ReleaseView }) {
  const sections: [string, string[]][] = [
    ['New features', r.features],
    ['Bug fixes', r.fixes],
    ['Known issues', r.issues]
  ];
  return (
    <div className="flex flex-col gap-3.5 rounded-lg border bg-white p-6 text-[13px] text-gray-900">
      <div>
        <div className="text-[11px] uppercase tracking-wider text-gray-500">Release notes</div>
        <div className="text-xl font-bold">
          {r.projectName} {r.version}
        </div>
        <div className="text-gray-500">
          {r.clientName} · {ENV_NAMES[r.environment] ?? r.environment} · {formatDate(r.releaseDate)}
        </div>
      </div>
      {sections.map(([title, items]) => (
        <div key={title}>
          <div className="mb-1 font-semibold">{title}</div>
          {items.length ? (
            <ul className="list-disc pl-5">
              {items.map(x => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          ) : (
            <div className="text-gray-500">None</div>
          )}
        </div>
      ))}
      <div className="border-t pt-2.5 text-xs text-gray-500">
        Released by {r.releasedByName ?? '—'} · D Solutions
      </div>
    </div>
  );
}

export function ReleaseNotesDialog({
  release,
  onOpenChange
}: {
  release: ReleaseView | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={!!release} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Release notes preview</DialogTitle>
          <DialogDescription>
            Plain notes you can paste into an email or chat. To email clients, use “Send release email” in the
            release’s menu.
          </DialogDescription>
        </DialogHeader>
        {release && <NotesBody r={release} />}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={async () => {
              if (!release) return;
              try {
                await navigator.clipboard.writeText(releaseNotesText(release));
                toast.success('Release notes copied');
              } catch {
                toast.error('Copy is blocked by the browser.');
              }
            }}
          >
            <Copy /> Copy as text
          </Button>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
