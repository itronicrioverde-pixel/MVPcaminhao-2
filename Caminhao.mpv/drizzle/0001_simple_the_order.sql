CREATE INDEX `idx_expenses_owner_date` ON `expenses` (`owner_id`,`expense_date`);--> statement-breakpoint
CREATE INDEX `idx_trips_owner_date` ON `trips` (`owner_id`,`trip_date`);--> statement-breakpoint
PRAGMA optimize;
