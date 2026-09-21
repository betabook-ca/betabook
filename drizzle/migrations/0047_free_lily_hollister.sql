CREATE TABLE `recap_shares` (
	`token` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`profile_token` text NOT NULL,
	`snapshot` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recap_shares_user_idx` ON `recap_shares` (`user_id`);