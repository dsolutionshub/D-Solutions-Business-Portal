-- "At risk" is no longer a project status: those projects become Active.
UPDATE `projects` SET `status` = 'Active' WHERE `status` = 'At risk';--> statement-breakpoint
-- Projects can no longer be archived: archived ones come back as Completed (nothing stays hidden).
UPDATE `projects` SET `status` = 'Completed', `archived_at` = NULL WHERE `archived_at` IS NOT NULL;
