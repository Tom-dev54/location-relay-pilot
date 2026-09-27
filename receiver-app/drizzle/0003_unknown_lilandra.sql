CREATE TABLE `map_cache` (
	`cache_key` text PRIMARY KEY NOT NULL,
	`body` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_map_cache_expiry` ON `map_cache` (`expires_at`);--> statement-breakpoint
CREATE TABLE `map_usage` (
	`bucket` text PRIMARY KEY NOT NULL,
	`day` text NOT NULL,
	`daily_count` integer NOT NULL,
	`monthly_count` integer NOT NULL
);
