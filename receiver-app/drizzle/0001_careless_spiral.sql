CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`submission_id` text NOT NULL,
	`lat` real NOT NULL,
	`lon` real NOT NULL,
	`accuracy` real NOT NULL,
	`crs` text NOT NULL,
	`captured_at` integer NOT NULL,
	`received_at` integer NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `invitations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_report_submission` ON `reports` (`request_id`,`submission_id`);--> statement-breakpoint
CREATE INDEX `idx_report_received` ON `reports` (`received_at`);