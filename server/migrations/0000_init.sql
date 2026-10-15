CREATE TABLE `alert_state` (
	`user_id` text NOT NULL,
	`alert_id` text NOT NULL,
	`read_at` text,
	`dismissed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`user_id`, `alert_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`meta` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_log_entity_idx` ON `audit_log` (`entity`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_log_user_idx` ON `audit_log` (`user_id`);--> statement-breakpoint
CREATE INDEX `audit_log_created_idx` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `clients` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`logo_key` text,
	`type` text,
	`industry` text,
	`website` text NOT NULL,
	`since` text,
	`description` text,
	`addr1` text NOT NULL,
	`addr2` text,
	`city` text NOT NULL,
	`state` text,
	`pin` text NOT NULL,
	`gstin` text,
	`currency` text DEFAULT 'INR' NOT NULL,
	`payment_terms` text DEFAULT 'Net 15' NOT NULL,
	`billing_address` text,
	`notes` text,
	`status` text DEFAULT 'Active' NOT NULL,
	`archived_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clients_name_unique` ON `clients` (lower(name));--> statement-breakpoint
CREATE INDEX `clients_status_idx` ON `clients` (`status`);--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`name` text NOT NULL,
	`role` text,
	`email` text NOT NULL,
	`phone` text,
	`alt_phone` text,
	`tag` text NOT NULL,
	`notify_releases` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `contacts_client_idx` ON `contacts` (`client_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `contacts_one_primary` ON `contacts` (`client_id`) WHERE tag = 'Primary';--> statement-breakpoint
CREATE TABLE `email_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`subject` text NOT NULL,
	`body_html` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_templates_name_unique` ON `email_templates` (`name`);--> statement-breakpoint
CREATE TABLE `emails` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`to_addresses` text NOT NULL,
	`to_text` text NOT NULL,
	`subject` text NOT NULL,
	`template_name` text,
	`body_html` text,
	`status` text NOT NULL,
	`send_at` text,
	`release_id` text,
	`attachment_count` integer DEFAULT 0 NOT NULL,
	`provider_message_id` text,
	`error` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `emails_client_idx` ON `emails` (`client_id`);--> statement-breakpoint
CREATE INDEX `emails_status_send_at_idx` ON `emails` (`status`,`send_at`);--> statement-breakpoint
CREATE TABLE `extra_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`label` text NOT NULL,
	`is_secret` integer DEFAULT false NOT NULL,
	`value_plain` text,
	`ciphertext` text,
	`iv` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "extra_keys_secret_storage" CHECK((is_secret = 1 AND value_plain IS NULL AND ciphertext IS NOT NULL AND iv IS NOT NULL)
       OR (is_secret = 0 AND ciphertext IS NULL AND iv IS NULL))
);
--> statement-breakpoint
CREATE INDEX `extra_keys_project_idx` ON `extra_keys` (`project_id`);--> statement-breakpoint
CREATE TABLE `invoice_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`description` text NOT NULL,
	`quantity` real DEFAULT 1 NOT NULL,
	`unit_price_paise` integer DEFAULT 0 NOT NULL,
	`work_item_id` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`work_item_id`) REFERENCES `work_items`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "invoice_lines_amounts" CHECK(quantity >= 0 AND unit_price_paise >= 0)
);
--> statement-breakpoint
CREATE INDEX `invoice_lines_invoice_idx` ON `invoice_lines` (`invoice_id`);--> statement-breakpoint
CREATE INDEX `invoice_lines_work_item_idx` ON `invoice_lines` (`work_item_id`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`number` text NOT NULL,
	`client_id` text NOT NULL,
	`project_id` text,
	`issue_date` text NOT NULL,
	`due_date` text NOT NULL,
	`status` text DEFAULT 'Draft' NOT NULL,
	`discount_pct` integer DEFAULT 0 NOT NULL,
	`gst_rate` integer DEFAULT 18 NOT NULL,
	`notes` text,
	`payment_instructions` text,
	`terms` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "invoices_gst_rate" CHECK(gst_rate IN (0, 5, 12, 18, 28)),
	CONSTRAINT "invoices_discount_pct" CHECK(discount_pct BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_number_unique` ON `invoices` (`number`);--> statement-breakpoint
CREATE INDEX `invoices_client_idx` ON `invoices` (`client_id`);--> statement-breakpoint
CREATE INDEX `invoices_project_idx` ON `invoices` (`project_id`);--> statement-breakpoint
CREATE INDEX `invoices_due_idx` ON `invoices` (`due_date`);--> statement-breakpoint
CREATE TABLE `lists` (
	`id` text PRIMARY KEY NOT NULL,
	`list_key` text NOT NULL,
	`value` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lists_key_value_unique` ON `lists` (`list_key`,`value`);--> statement-breakpoint
CREATE INDEX `lists_key_order_idx` ON `lists` (`list_key`,`sort_order`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`receipt_no` text NOT NULL,
	`invoice_id` text NOT NULL,
	`paid_on` text NOT NULL,
	`method` text NOT NULL,
	`reference` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "payments_amount_positive" CHECK(amount_paise > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_receipt_unique` ON `payments` (`receipt_no`);--> statement-breakpoint
CREATE INDEX `payments_invoice_idx` ON `payments` (`invoice_id`);--> statement-breakpoint
CREATE INDEX `payments_paid_on_idx` ON `payments` (`paid_on`);--> statement-breakpoint
CREATE TABLE `project_costs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`amount_paise` integer DEFAULT 0 NOT NULL,
	`cycle` text DEFAULT 'Monthly' NOT NULL,
	`next_due` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_costs_project_idx` ON `project_costs` (`project_id`);--> statement-breakpoint
CREATE INDEX `project_costs_next_due_idx` ON `project_costs` (`next_due`);--> statement-breakpoint
CREATE TABLE `project_secrets` (
	`project_id` text NOT NULL,
	`field_key` text NOT NULL,
	`ciphertext` text NOT NULL,
	`iv` text NOT NULL,
	`updated_by` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`project_id`, `field_key`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `project_sheet` (
	`project_id` text PRIMARY KEY NOT NULL,
	`links_prod` text NOT NULL,
	`links_staging` text,
	`links_dev` text,
	`links_admin` text,
	`links_api` text,
	`links_api_staging` text,
	`links_repo` text,
	`social_instagram` text,
	`social_facebook` text,
	`social_youtube` text,
	`social_other` text,
	`domain_name` text,
	`domain_registrar` text,
	`domain_account` text,
	`domain_purchased` text,
	`domain_expiry` text,
	`domain_cost_paise` integer,
	`domain_renewal_paise` integer,
	`domain_auto_renew` integer DEFAULT false NOT NULL,
	`domain_dns` text,
	`domain_ssl_provider` text,
	`domain_ssl_expiry` text,
	`domain_ssl_cost_paise` integer,
	`hosting_platform` text,
	`hosting_plan` text,
	`hosting_region` text,
	`hosting_ip` text,
	`hosting_account` text,
	`hosting_cost_paise` integer,
	`hosting_cycle` text,
	`hosting_next_bill` text,
	`db_engine` text,
	`db_host` text,
	`db_port` text,
	`db_name` text,
	`db_user` text,
	`db_console` text,
	`db_backup` text,
	`keys_google_client_id` text,
	`keys_pay_gateway` text,
	`keys_pay_key_id` text,
	`keys_shipping` text,
	`keys_ga4` text,
	`keys_pixel` text,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_sheet_domain_expiry_idx` ON `project_sheet` (`domain_expiry`);--> statement-breakpoint
CREATE INDEX `project_sheet_ssl_expiry_idx` ON `project_sheet` (`domain_ssl_expiry`);--> statement-breakpoint
CREATE INDEX `project_sheet_hosting_next_bill_idx` ON `project_sheet` (`hosting_next_bill`);--> statement-breakpoint
CREATE INDEX `project_sheet_hosting_platform_idx` ON `project_sheet` (`hosting_platform`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text,
	`status` text DEFAULT 'Active' NOT NULL,
	`start_date` text,
	`stack` text,
	`environments` text NOT NULL,
	`archived_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `projects_client_idx` ON `projects` (`client_id`);--> statement-breakpoint
CREATE INDEX `projects_status_idx` ON `projects` (`status`);--> statement-breakpoint
CREATE TABLE `release_items` (
	`id` text PRIMARY KEY NOT NULL,
	`release_id` text NOT NULL,
	`kind` text NOT NULL,
	`text` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `release_items_release_idx` ON `release_items` (`release_id`);--> statement-breakpoint
CREATE TABLE `releases` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`version` text NOT NULL,
	`environment` text NOT NULL,
	`release_date` text NOT NULL,
	`status` text NOT NULL,
	`released_by` text,
	`mail_status` text DEFAULT 'Not sent' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`released_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `releases_project_idx` ON `releases` (`project_id`);--> statement-breakpoint
CREATE INDEX `releases_date_idx` ON `releases` (`release_date`);--> statement-breakpoint
CREATE TABLE `renewal_history` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`project_id` text,
	`kind` text,
	`item_name` text NOT NULL,
	`renewed_on` text NOT NULL,
	`amount_paise` integer DEFAULT 0 NOT NULL,
	`period` text NOT NULL,
	`renewed_by` text NOT NULL,
	`reference` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `renewal_history_client_idx` ON `renewal_history` (`client_id`);--> statement-breakpoint
CREATE INDEX `renewal_history_project_idx` ON `renewal_history` (`project_id`);--> statement-breakpoint
CREATE INDEX `renewal_history_date_idx` ON `renewal_history` (`renewed_on`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`company` text NOT NULL,
	`address` text,
	`gstin` text,
	`bank` text,
	`upi` text,
	`invoice_prefix` text NOT NULL,
	`next_invoice_no` integer DEFAULT 1 NOT NULL,
	`hourly_rate_paise` integer DEFAULT 0 NOT NULL,
	`notification_prefs` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "settings_single_row" CHECK(id = 1)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`status` text DEFAULT 'Invited' NOT NULL,
	`last_login_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `work_items` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`release_id` text,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`delivered_on` text NOT NULL,
	`billing` text NOT NULL,
	`amount_paise` integer DEFAULT 0 NOT NULL,
	`hours` real DEFAULT 0 NOT NULL,
	`rate_paise` integer DEFAULT 0 NOT NULL,
	`invoice_id` text,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "work_items_amounts" CHECK(amount_paise >= 0 AND rate_paise >= 0 AND hours >= 0)
);
--> statement-breakpoint
CREATE INDEX `work_items_project_idx` ON `work_items` (`project_id`);--> statement-breakpoint
CREATE INDEX `work_items_release_idx` ON `work_items` (`release_id`);--> statement-breakpoint
CREATE INDEX `work_items_invoice_idx` ON `work_items` (`invoice_id`);