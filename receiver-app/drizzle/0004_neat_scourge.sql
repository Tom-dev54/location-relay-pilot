ALTER TABLE `public_positions` ADD `initial_snapshot` text;--> statement-breakpoint
ALTER TABLE `public_positions` ADD `update_token_hash` text;--> statement-breakpoint
ALTER TABLE `public_positions` ADD `revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `public_positions` ADD `updated_at` integer;