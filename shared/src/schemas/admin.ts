/** Daily cron runs (Settings → Data) and the manual trigger. */
export interface CronRunCounts {
  alerts: number;
  digests: number;
  digestItems: number;
  clientReminders: number;
  scheduledSent: number;
  skippedAlreadySent: number;
  blockedByLimit: number;
}

export interface CronRun {
  id: string;
  runDate: string;
  trigger: 'schedule' | 'manual';
  startedAt: string;
  finishedAt: string | null;
  counts: CronRunCounts | null;
  errors: string[];
}

/** GET /api/emails/quota — how much of the Brevo daily limit is used (recipients today). */
export interface EmailQuota {
  used: number;
  limit: number;
  /** true when the limit is reached: sending is paused until tomorrow */
  blocked: boolean;
  /** true from 80% */
  warning: boolean;
  /** "Logged (dev)" mode: no Brevo key in local development */
  devMode: boolean;
}
