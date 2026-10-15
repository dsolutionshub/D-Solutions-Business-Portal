import { PageHeader } from '@/components/common/PageHeader';
import { PageTabs } from '@/components/common/PageTabs';
import { useAlerts } from '../api';
import { AlertList } from '../components/AlertList';
import { NoticesPanel } from '../components/NoticesPanel';
import { NotificationPrefsForm } from '../components/NotificationPrefsForm';

export function NotificationsPage() {
  const unread = useAlerts().data?.unread;
  return (
    <>
      <PageHeader title="Notifications" />
      <PageTabs
        defaultTab="inbox"
        tabs={[
          { value: 'inbox', label: 'Inbox', count: unread, content: <AlertList /> },
          { value: 'prefs', label: 'Preferences', content: <NotificationPrefsForm /> },
          { value: 'notices', label: 'Notices', content: <NoticesPanel /> }
        ]}
      />
    </>
  );
}
