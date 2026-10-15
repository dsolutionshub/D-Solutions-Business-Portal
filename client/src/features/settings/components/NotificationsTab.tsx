import { Bell } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';

/** Settings → Notifications: reminder preferences live on the Notifications page. */
export function NotificationsTab() {
  return (
    <div className="flex max-w-3xl flex-wrap items-center justify-between gap-3 px-5 py-5">
      <div>
        <div className="font-semibold">Notification preferences</div>
        <div className="text-xs text-muted-foreground">
          Reminder intervals and channels (email digest, in-app) for domains, SSL, hosting, subscriptions,
          invoices and notices.
        </div>
      </div>
      <Button asChild variant="outline" size="sm">
        <Link to="/notifications?tab=prefs">
          <Bell /> Open preferences
        </Link>
      </Button>
    </div>
  );
}
