CREATE TABLE `catalog_external_refs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`external_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`betabook_id` integer NOT NULL,
	`match_method` text NOT NULL,
	`confidence` real,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_external_refs_source_id_idx` ON `catalog_external_refs` (`source`,`external_id`);--> statement-breakpoint
CREATE INDEX `catalog_external_refs_entity_idx` ON `catalog_external_refs` (`entity_type`,`betabook_id`);--> statement-breakpoint
CREATE TABLE `catalog_import_decisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`source` text NOT NULL,
	`source_entity_type` text NOT NULL,
	`external_id` text NOT NULL,
	`decision` text NOT NULL,
	`betabook_id` integer,
	`method` text NOT NULL,
	`confidence` real,
	`candidate_ids` text NOT NULL,
	`reasoning` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `catalog_import_decisions_run_idx` ON `catalog_import_decisions` (`run_id`);--> statement-breakpoint
CREATE INDEX `catalog_import_decisions_source_idx` ON `catalog_import_decisions` (`source`,`external_id`);--> statement-breakpoint
ALTER TABLE `areas` ADD `latitude` real;--> statement-breakpoint
ALTER TABLE `areas` ADD `longitude` real;--> statement-breakpoint
ALTER TABLE `climbs` ADD `latitude` real;--> statement-breakpoint
ALTER TABLE `climbs` ADD `longitude` real;