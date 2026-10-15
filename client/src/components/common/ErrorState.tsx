import { AlertTriangle, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { EmptyState } from './EmptyState';

/** "Couldn't load" with the reason and a Retry button. */
export function ErrorState({
  error,
  onRetry,
  title = 'Couldn’t load this'
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
}) {
  const notFound = error instanceof ApiError && error.status === 404;
  return (
    <EmptyState
      icon={AlertTriangle}
      title={notFound ? 'Not found' : title}
      description={error instanceof Error ? error.message : 'Something went wrong.'}
      action={
        onRetry && !notFound ? (
          <Button size="sm" variant="outline" onClick={onRetry}>
            <RotateCw /> Retry
          </Button>
        ) : undefined
      }
    />
  );
}
