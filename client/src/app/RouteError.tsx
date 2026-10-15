import { AlertTriangle } from 'lucide-react';
import { isRouteErrorResponse, Link, useNavigate, useRouteError } from 'react-router';
import { EmptyState } from '@/components/common/EmptyState';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { NotFoundPage } from './NotFoundPage';

/** Shown inside the app shell when a screen throws while rendering. */
export function RouteError() {
  const error = useRouteError();
  const navigate = useNavigate();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;
  console.error(error);
  return (
    <Card>
      <EmptyState
        icon={AlertTriangle}
        title="Something went wrong"
        description="This screen failed to load. Try again or go back to the dashboard."
        action={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => navigate(0)}>
              Retry
            </Button>
            <Button asChild size="sm">
              <Link to="/dashboard">Dashboard</Link>
            </Button>
          </div>
        }
      />
    </Card>
  );
}
