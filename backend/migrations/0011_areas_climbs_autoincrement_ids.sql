PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_areas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`parent_id` integer,
	`lft` integer NOT NULL,
	`rght` integer NOT NULL,
	`name` text NOT NULL,
	`description` text,
	FOREIGN KEY (`parent_id`) REFERENCES `areas`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_areas`("id", "parent_id", "lft", "rght", "name", "description") SELECT "id", "parent_id", "lft", "rght", "name", "description" FROM `areas`;--> statement-breakpoint
DROP TABLE `areas`;--> statement-breakpoint
ALTER TABLE `__new_areas` RENAME TO `areas`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `areas_parent_idx` ON `areas` (`parent_id`);--> statement-breakpoint
CREATE INDEX `areas_lft_idx` ON `areas` (`lft`);--> statement-breakpoint
CREATE INDEX `areas_rght_idx` ON `areas` (`rght`);--> statement-breakpoint
-- The table rebuild above (needed for the AUTOINCREMENT change) drops every
-- index on `areas`, including this hand-written one from
-- 0006_expression_indexes.sql that drizzle-kit doesn't know about since it
-- isn't modeled in drizzle/schema/areas.ts — recreate it or
-- findClimbsByNameAndArea's area-name lookup silently loses its index.
CREATE INDEX areas_name_lower_idx ON areas (LOWER(TRIM(name)));--> statement-breakpoint
CREATE TABLE `__new_climbs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`area_id` integer NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`grade` integer,
	`description` text,
	`lft` integer DEFAULT 0 NOT NULL,
	`rght` integer DEFAULT 0 NOT NULL,
	`send_count` integer DEFAULT 0 NOT NULL,
	`rating_sum` integer DEFAULT 0 NOT NULL,
	`rating_count` integer DEFAULT 0 NOT NULL,
	`avg_rating` real GENERATED ALWAYS AS (CASE WHEN rating_count > 0 THEN CAST(rating_sum AS REAL) / rating_count ELSE NULL END) VIRTUAL,
	FOREIGN KEY (`area_id`) REFERENCES `areas`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_climbs`("id", "area_id", "name", "type", "grade", "description", "lft", "rght", "send_count", "rating_sum", "rating_count") SELECT "id", "area_id", "name", "type", "grade", "description", "lft", "rght", "send_count", "rating_sum", "rating_count" FROM `climbs`;--> statement-breakpoint
DROP TABLE `climbs`;--> statement-breakpoint
ALTER TABLE `__new_climbs` RENAME TO `climbs`;--> statement-breakpoint
CREATE INDEX `climbs_area_idx` ON `climbs` (`area_id`);--> statement-breakpoint
CREATE INDEX `climbs_type_grade_idx` ON `climbs` (`type`,`grade`);--> statement-breakpoint
-- Same as areas_name_lower_idx above — the table rebuild drops every
-- hand-written index from 0006_expression_indexes.sql and
-- 0012_climb_sort_indexes.sql that isn't modeled in drizzle/schema/climbs.ts.
-- Recreate all of them so findClimbsByNameAndArea and every getSubtreeClimbs
-- sort order keep their supporting index instead of silently falling back
-- to a full table scan/sort.
CREATE INDEX climbs_name_lower_idx ON climbs (LOWER(TRIM(name)));--> statement-breakpoint
CREATE INDEX climbs_lft_rght_idx ON climbs (lft, rght);--> statement-breakpoint
CREATE INDEX climbs_name_asc_idx ON climbs (name ASC, id ASC);--> statement-breakpoint
CREATE INDEX climbs_name_desc_idx ON climbs (name DESC, id ASC);--> statement-breakpoint
CREATE INDEX climbs_grade_asc_idx ON climbs ((grade IS NULL), grade, id);--> statement-breakpoint
CREATE INDEX climbs_grade_desc_idx ON climbs (grade DESC, id ASC);--> statement-breakpoint
CREATE INDEX climbs_send_count_asc_idx ON climbs (send_count ASC, id ASC);--> statement-breakpoint
CREATE INDEX climbs_send_count_desc_idx ON climbs (send_count DESC, id ASC);--> statement-breakpoint
CREATE INDEX climbs_avg_rating_asc_idx ON climbs ((avg_rating IS NULL), avg_rating, id);--> statement-breakpoint
CREATE INDEX climbs_avg_rating_desc_idx ON climbs (avg_rating DESC, id ASC);--> statement-breakpoint
ANALYZE climbs;--> statement-breakpoint
ANALYZE areas;