CREATE TABLE `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`label` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_invitation_owner_created` ON `invitations` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_invitation_token` ON `invitations` (`token_hash`);--> statement-breakpoint
CREATE TABLE `positions` (
	`request_id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`lat` real NOT NULL,
	`lon` real NOT NULL,
	`accuracy` real NOT NULL,
	`crs` text NOT NULL,
	`captured_at` integer NOT NULL,
	`received_at` integer NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `invitations`(`id`) ON UPDATE no action ON DELETE cascade
);
