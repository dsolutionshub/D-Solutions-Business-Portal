import type { Permission } from '@dsol/shared';
import { Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/common/EmptyState';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useCan, useMe } from '@/lib/auth';

/** Shows the page only to roles with this permission (the API refuses the others anyway). */
export function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const me = useMe();
  const allowed = useCan(permission);
  if (!me.data) return null;
  if (allowed) return <>{children}</>;
  return (
    <Card>
      <EmptyState
        icon={Lock}
        title="You don’t have access to this page"
        description={`Your role (${me.data.user?.role ?? 'none'}) can’t open it. Ask an Admin if you need access.`}
        action={
          <Button asChild size="sm" variant="outline">
            <Link to="/dashboard">Go to the dashboard</Link>
          </Button>
        }
      />
    </Card>
  );
}
