CREATE TABLE `reminder_log` (
	`recipient` text NOT NULL,
	`alert_id` text NOT NULL,
	`threshold` integer NOT NULL,
	`sent_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`recipient`, `alert_id`, `threshold`)
);
