import { LayoutDashboard } from 'lucide-react';
import { EmptyState } from '@/components/common/EmptyState';
import { Card } from '@/components/ui/card';

/**
 * Parked, as in the prototype. Every number it would show is on its own screen:
 * Clients, Invoices, Payments, Notifications, Reports.
 */
export function DashboardPage() {
  return (
    <Card>
      <EmptyState
        icon={LayoutDashboard}
        className="py-24"
        title={<h1 className="text-[22px] font-semibold tracking-tight">Dashboard coming soon</h1>}
      />
    </Card>
  );
}
