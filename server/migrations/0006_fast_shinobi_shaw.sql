ALTER TABLE `clients` ADD `social_instagram` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `social_facebook` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `social_youtube` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `social_other` text;--> statement-breakpoint
-- Social media now belongs to the client: copy each client's links from its projects (oldest project first).
UPDATE `clients` SET `social_instagram` = (SELECT ps.`social_instagram` FROM `project_sheet` ps JOIN `projects` p ON p.`id` = ps.`project_id` WHERE p.`client_id` = `clients`.`id` AND ps.`social_instagram` IS NOT NULL ORDER BY p.`created_at` LIMIT 1);
--> statement-breakpoint
UPDATE `clients` SET `social_facebook` = (SELECT ps.`social_facebook` FROM `project_sheet` ps JOIN `projects` p ON p.`id` = ps.`project_id` WHERE p.`client_id` = `clients`.`id` AND ps.`social_facebook` IS NOT NULL ORDER BY p.`created_at` LIMIT 1);
--> statement-breakpoint
UPDATE `clients` SET `social_youtube` = (SELECT ps.`social_youtube` FROM `project_sheet` ps JOIN `projects` p ON p.`id` = ps.`project_id` WHERE p.`client_id` = `clients`.`id` AND ps.`social_youtube` IS NOT NULL ORDER BY p.`created_at` LIMIT 1);
--> statement-breakpoint
UPDATE `clients` SET `social_other` = (SELECT ps.`social_other` FROM `project_sheet` ps JOIN `projects` p ON p.`id` = ps.`project_id` WHERE p.`client_id` = `clients`.`id` AND ps.`social_other` IS NOT NULL ORDER BY p.`created_at` LIMIT 1);
