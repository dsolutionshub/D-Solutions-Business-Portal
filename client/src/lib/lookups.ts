/** Company settings and the team list, used by forms and papers. */
import type { NotificationPrefs, Role } from '@dsol/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export interface SettingsView {
  company: string;
  address: string | null;
  gstin: string | null;
  bank: string | null;
  upi: string | null;
  invoicePrefix: string;
  nextInvoiceNo: number;
  hourlyRatePaise: number;
  notificationPrefs: NotificationPrefs;
  emailFromName: string | null;
  emailFromAddress: string | null;
  timezone: string;
  emailDailyLimit: number;
  clientOverdueReminders: boolean;
  updatedAt: string;
  /** what the sender falls back to when the fields are empty */
  emailDefaults: { name: string; address: string };
  /** local development without a Brevo key: emails are logged, not sent */
  emailDevMode: boolean;
}

export const lookupsApi = {
  settings: () => api.get<SettingsView>('/settings'),
  users: () => api.get<{ items: { id: string; name: string; role: Role; status: string }[] }>('/users')
};

export const useSettings = () =>
  useQuery({ queryKey: ['settings'], queryFn: lookupsApi.settings, staleTime: 5 * 60_000 });
export const useTeam = () =>
  useQuery({
    queryKey: ['users', 'active'],
    queryFn: lookupsApi.users,
    select: d => d.items,
    staleTime: 5 * 60_000
  });
