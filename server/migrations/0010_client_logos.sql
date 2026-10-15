CREATE TABLE `client_logos` (
	`client_id` text PRIMARY KEY NOT NULL,
	`content_type` text NOT NULL,
	`data` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- Logos used to live in R2 (no longer used); those files are not copied, so clear the references.
UPDATE `clients` SET `logo_key` = NULL WHERE `logo_key` IS NOT NULL;
