import { PageHeader } from '@/components/common/PageHeader';
import { PageTabs } from '@/components/common/PageTabs';
import { AppearanceTab } from '../components/AppearanceTab';
import { CompanyInvoicingTab } from '../components/CompanyInvoicingTab';
import { DataTab } from '../components/DataTab';
import { DropdownListsTab } from '../components/DropdownListsTab';
import { NotificationsTab } from '../components/NotificationsTab';

export function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <PageTabs
        defaultTab="company"
        tabs={[
          { value: 'company', label: 'Company & invoicing', content: <CompanyInvoicingTab /> },
          { value: 'lists', label: 'Dropdown lists', content: <DropdownListsTab /> },
          { value: 'notifications', label: 'Notifications', content: <NotificationsTab /> },
          { value: 'appearance', label: 'Appearance', content: <AppearanceTab /> },
          { value: 'data', label: 'Data', content: <DataTab /> }
        ]}
      />
    </>
  );
}
