CREATE TABLE `catalog_area_sources` (
	`source` text NOT NULL,
	`source_path` text NOT NULL,
	`area_id` integer,
	`quality` text NOT NULL,
	`release` text NOT NULL,
	PRIMARY KEY(`source`, `source_path`),
	FOREIGN KEY (`area_id`) REFERENCES `areas`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `catalog_area_sources_area_idx` ON `catalog_area_sources` (`area_id`);--> statement-breakpoint
CREATE TABLE `catalog_route_sources` (
	`source` text NOT NULL,
	`source_id` text NOT NULL,
	`climb_id` integer,
	`source_name` text NOT NULL,
	`source_grade` text,
	`source_type` text NOT NULL,
	`source_path` text NOT NULL,
	`latitude` real,
	`longitude` real,
	`status` text NOT NULL,
	`match_kind` text,
	`match_score` real,
	`release` text NOT NULL,
	PRIMARY KEY(`source`, `source_id`),
	FOREIGN KEY (`climb_id`) REFERENCES `climbs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `catalog_route_sources_climb_idx` ON `catalog_route_sources` (`climb_id`);--> statement-breakpoint
CREATE INDEX `catalog_route_sources_path_idx` ON `catalog_route_sources` (`source`,`source_path`);