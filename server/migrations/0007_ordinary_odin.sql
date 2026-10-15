CREATE TABLE `roles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`permissions` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roles_name_unique` ON `roles` (lower(name));--> statement-breakpoint
-- Developer and Accounts are no longer built-in roles: deactivate anyone who had them (an Owner can
-- reactivate them after giving them Admin or a new custom role) and end their sessions.
DELETE FROM `sessions` WHERE `user_id` IN (SELECT `id` FROM `users` WHERE `role` NOT IN ('Owner', 'Admin'));--> statement-breakpoint
UPDATE `users` SET `status` = 'Deactivated' WHERE `role` NOT IN ('Owner', 'Admin');
