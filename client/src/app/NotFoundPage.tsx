import { Link } from 'react-router';
import { EmptyState } from '@/components/common/EmptyState';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export function NotFoundPage() {
  return (
    <Card>
      <EmptyState
        title="Page not found"
        description="That link does not match any screen."
        action={
          <Button asChild size="sm">
            <Link to="/dashboard">Go to dashboard</Link>
          </Button>
        }
      />
    </Card>
  );
}
