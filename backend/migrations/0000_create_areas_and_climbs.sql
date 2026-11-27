CREATE TABLE `areas` (
	`id` integer PRIMARY KEY NOT NULL,
	`parent_id` integer,
	`lft` integer NOT NULL,
	`rght` integer NOT NULL,
	`name` text NOT NULL,
	`description` text,
	FOREIGN KEY (`parent_id`) REFERENCES `areas`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `areas_parent_idx` ON `areas` (`parent_id`);--> statement-breakpoint
CREATE INDEX `areas_lft_idx` ON `areas` (`lft`);--> statement-breakpoint
CREATE INDEX `areas_rght_idx` ON `areas` (`rght`);--> statement-breakpoint
CREATE TABLE `climbs` (
	`id` integer PRIMARY KEY NOT NULL,
	`area_id` integer NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`grade` integer,
	FOREIGN KEY (`area_id`) REFERENCES `areas`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `climbs_area_idx` ON `climbs` (`area_id`);--> statement-breakpoint
CREATE INDEX `climbs_type_grade_idx` ON `climbs` (`type`,`grade`);