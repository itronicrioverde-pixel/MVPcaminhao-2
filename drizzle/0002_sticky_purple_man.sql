CREATE TABLE `companies` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`name` text DEFAULT 'Rota Financeira' NOT NULL,
	`cnpj` text DEFAULT '' NOT NULL,
	`logo_key` text
);
--> statement-breakpoint
CREATE TABLE `revenues` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`revenue_date` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`amount` real NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_revenues_owner_date` ON `revenues` (`owner_id`,`revenue_date`);--> statement-breakpoint
ALTER TABLE `trips` ADD `extra_items` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `trips` ADD `axles` integer DEFAULT 6 NOT NULL;