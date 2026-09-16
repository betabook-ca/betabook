ALTER TABLE `goals` ADD `tags` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `goal_periods` ADD `tags` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
CREATE TABLE `goal_completions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`goal_id` integer NOT NULL,
	`period_start` text NOT NULL,
	`repeat` text NOT NULL,
	`completed_date` text,
	`definition` text NOT NULL,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `goal_completions_period_idx` ON `goal_completions` (`goal_id`,`period_start`,`repeat`);
--> statement-breakpoint
ALTER TABLE `goals` ADD `recurring_end_date` text;
