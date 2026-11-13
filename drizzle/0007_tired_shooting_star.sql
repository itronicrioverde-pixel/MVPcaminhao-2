CREATE TABLE `fuel_records` (
	`id` text NOT NULL,
	`owner_id` text NOT NULL,
	`odometer_km` integer NOT NULL,
	`liters_milli` integer NOT NULL,
	`full` integer DEFAULT 1 NOT NULL,
	`state` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`owner_id`, `id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_fuel_owner_odometer` ON `fuel_records` (`owner_id`,`odometer_km`);