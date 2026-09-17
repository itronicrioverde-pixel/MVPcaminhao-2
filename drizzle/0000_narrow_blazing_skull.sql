CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`expense_date` text NOT NULL,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`amount` real DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `trips` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`trip_date` text NOT NULL,
	`origin` text NOT NULL,
	`destination` text NOT NULL,
	`client_name` text DEFAULT 'Cliente não informado' NOT NULL,
	`cargo_type` text DEFAULT 'Carga geral' NOT NULL,
	`freight` real DEFAULT 0 NOT NULL,
	`km` integer DEFAULT 0 NOT NULL,
	`oil` real DEFAULT 0 NOT NULL,
	`diesel` real DEFAULT 0 NOT NULL,
	`toll` real DEFAULT 0 NOT NULL,
	`extras` real DEFAULT 0 NOT NULL,
	`loaded_weight` real,
	`delivered_weight` real,
	`status` text DEFAULT 'Concluído' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
