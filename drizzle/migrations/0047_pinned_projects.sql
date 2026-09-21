CREATE TABLE `pinned_projects` (
	`user_id` text NOT NULL,
	`climb_id` integer NOT NULL,
	`pinned_at` text DEFAULT (date('now')) NOT NULL,
	PRIMARY KEY(`user_id`, `climb_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`climb_id`) REFERENCES `climbs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pinned_projects_climb_idx` ON `pinned_projects` (`climb_id`);