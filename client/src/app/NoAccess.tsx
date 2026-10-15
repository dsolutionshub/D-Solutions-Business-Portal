import { ShieldX } from 'lucide-react';
import { EmptyState } from '@/components/common/EmptyState';
import { Card } from '@/components/ui/card';

/** Signed in (e.g. through Cloudflare Access), but not an active user of the portal. */
export function NoAccess({ email }: { email: string }) {
  return (
    <Card>
      <EmptyState
        icon={ShieldX}
        className="py-24"
        title={<h1 className="text-[20px] font-semibold">You don’t have access yet</h1>}
        description={
          <>
            You’re signed in as <b className="text-foreground">{email}</b>, but this email isn’t set up in the
            portal. Ask an Admin to invite you.
          </>
        }
      />
    </Card>
  );
}
