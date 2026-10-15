/** Reports: one call for every card, plus a CSV per report. */
import type { ReportKey, ReportRange, Reports } from '@dsol/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, qs } from '@/lib/api';

export const reportsApi = {
  get: (range: ReportRange, client?: string) => api.get<Reports>('/reports' + qs({ range, client })),
  csv: (key: ReportKey, range: ReportRange, client?: string) =>
    api.download(`/reports/${key}.csv` + qs({ range, client }), `report-${key}.csv`)
};

export const useReports = (range: ReportRange, client?: string) =>
  useQuery({
    queryKey: ['reports', range, client ?? ''],
    queryFn: () => reportsApi.get(range, client),
    placeholderData: keepPreviousData
  });
