CREATE TABLE `trips` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "trips_dates" CHECK("trips"."end_date" >= "trips"."start_date"),
	CONSTRAINT "trips_name" CHECK(length(trim("trips"."name")) BETWEEN 1 AND 80),
	CONSTRAINT "trips_description" CHECK("trips"."description" IS NULL OR length("trips"."description") <= 2000)
);
--> statement-breakpoint
CREATE INDEX `trips_user_start_idx` ON `trips` (`user_id`,`start_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `trips_user_id_idx` ON `trips` (`user_id`,`id`);