CREATE INDEX `audit_log_action_created_idx` ON `audit_log` (`action`,`created_at`);--> statement-breakpoint
CREATE INDEX `cron_runs_trigger_started_idx` ON `cron_runs` (`trigger`,`started_at`);--> statement-breakpoint
CREATE INDEX `emails_send_at_idx` ON `emails` (`send_at`);