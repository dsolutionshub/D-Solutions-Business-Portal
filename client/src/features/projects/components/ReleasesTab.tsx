import { ReleasesBoard } from '@/features/releases/components/ReleasesBoard';

/** The project's releases — same components as the Releases page, filtered to this project. */
export function ReleasesTab({ projectId, clientId }: { projectId: string; clientId: string }) {
  return (
    <div className="flex flex-col gap-4 p-1">
      <ReleasesBoard projectId={projectId} clientId={clientId} />
    </div>
  );
}
