import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { useCan } from '@/lib/auth';
import { ReleasesBoard } from '../components/ReleasesBoard';

export function ReleasesPage() {
  const canWrite = useCan('releases.write');
  return (
    <ReleasesBoard
      header={openAdd => (
        <PageHeader
          title="Releases"
          actions={
            canWrite && (
              <Button onClick={openAdd}>
                <Plus /> Add release
              </Button>
            )
          }
        />
      )}
    />
  );
}
