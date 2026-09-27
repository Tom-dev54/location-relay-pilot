CREATE TABLE `public_positions` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`lat` real NOT NULL,
	`lon` real NOT NULL,
	`accuracy` real NOT NULL,
	`crs` text NOT NULL,
	`captured_at` integer NOT NULL,
	`received_at` integer NOT NULL,
	`mode` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_public_received` ON `public_positions` (`received_at`);