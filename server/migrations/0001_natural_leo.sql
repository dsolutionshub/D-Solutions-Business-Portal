CREATE TABLE `cron_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`run_date` text NOT NULL,
	`trigger` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`counts` text,
	`errors` text
);
--> statement-breakpoint
CREATE INDEX `cron_runs_date_idx` ON `cron_runs` (`run_date`);--> statement-breakpoint
CREATE TABLE `notices` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`date` text NOT NULL,
	`type` text NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `notices_date_idx` ON `notices` (`date`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_emails` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text,
	`kind` text DEFAULT 'client' NOT NULL,
	`to_addresses` text NOT NULL,
	`cc_addresses` text DEFAULT '[]' NOT NULL,
	`to_text` text NOT NULL,
	`recipient_count` integer DEFAULT 1 NOT NULL,
	`subject` text NOT NULL,
	`template_name` text,
	`body_html` text,
	`status` text NOT NULL,
	`send_at` text,
	`release_id` text,
	`invoice_id` text,
	`payment_id` text,
	`attachment_count` integer DEFAULT 0 NOT NULL,
	`dedupe_key` text,
	`sent_by` text,
	`provider_message_id` text,
	`error` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`sent_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_emails`("id", "client_id", "to_addresses", "to_text", "subject", "template_name", "body_html", "status", "send_at", "release_id", "attachment_count", "provider_message_id", "error", "created_at", "updated_at", "recipient_count") SELECT "id", "client_id", "to_addresses", "to_text", "subject", "template_name", "body_html", "status", "send_at", "release_id", "attachment_count", "provider_message_id", "error", "created_at", "updated_at", json_array_length("to_addresses") FROM `emails`;--> statement-breakpoint
DROP TABLE `emails`;--> statement-breakpoint
ALTER TABLE `__new_emails` RENAME TO `emails`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `emails_client_idx` ON `emails` (`client_id`);--> statement-breakpoint
CREATE INDEX `emails_status_send_at_idx` ON `emails` (`status`,`send_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `emails_dedupe_unique` ON `emails` (`dedupe_key`);--> statement-breakpoint
ALTER TABLE `renewal_history` ADD `paid_via` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `email_from_name` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `email_from_address` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `timezone` text DEFAULT 'Asia/Kolkata' NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `email_daily_limit` integer DEFAULT 300 NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `client_overdue_reminders` integer DEFAULT false NOT NULL;