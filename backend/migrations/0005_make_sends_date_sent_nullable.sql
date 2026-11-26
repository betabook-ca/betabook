PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_sends` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`climb_id` integer NOT NULL,
	`completion_type` text NOT NULL,
	`date_sent` text,
	`comment` text,
	`rating` integer,
	`suggested_grade` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`climb_id`) REFERENCES `climbs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_sends`("id", "user_id", "climb_id", "completion_type", "date_sent", "comment", "rating", "suggested_grade", "created_at", "updated_at") SELECT "id", "user_id", "climb_id", "completion_type", "date_sent", "comment", "rating", "suggested_grade", "created_at", "updated_at" FROM `sends`;--> statement-breakpoint
DROP TABLE `sends`;--> statement-breakpoint
ALTER TABLE `__new_sends` RENAME TO `sends`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `sends_user_climb_unique` ON `sends` (`user_id`,`climb_id`);--> statement-breakpoint
CREATE INDEX `sends_climb_idx` ON `sends` (`climb_id`);--> statement-breakpoint
CREATE INDEX `sends_user_idx` ON `sends` (`user_id`);