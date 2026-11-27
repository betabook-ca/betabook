-- Saved climb lists. A list is ordered by its owner (climb_list_items.position).
-- Who can open lists is one setting for all of a climber's lists,
-- user.climb_list_visibility, which starts at Friends like trip_visibility.
-- The column has a default, so the previously deployed worker keeps inserting
-- users without it. Each list may also have one share link, which opens that
-- list whatever the setting says.
CREATE TABLE `climb_list_items` (
	`list_id` integer NOT NULL,
	`climb_id` integer NOT NULL,
	`position` integer NOT NULL,
	`added_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`list_id`, `climb_id`),
	FOREIGN KEY (`list_id`) REFERENCES `climb_lists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`climb_id`) REFERENCES `climbs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `climb_list_items_climb_idx` ON `climb_list_items` (`climb_id`);--> statement-breakpoint
CREATE TABLE `climb_lists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "climb_lists_title" CHECK(length(trim("climb_lists"."title")) BETWEEN 1 AND 80),
	CONSTRAINT "climb_lists_description" CHECK("climb_lists"."description" IS NULL OR length("climb_lists"."description") <= 5000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `climb_lists_user_id_idx` ON `climb_lists` (`user_id`,`id`);--> statement-breakpoint
CREATE INDEX `climb_lists_user_updated_idx` ON `climb_lists` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `climb_list_share_links` (
	`token` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`user_id` text NOT NULL,
	`list_id` integer NOT NULL,
	`expires_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`list_id`) REFERENCES `climb_lists`(`user_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "climb_list_share_links_expires_at_format" CHECK("climb_list_share_links"."expires_at" IS NULL OR "climb_list_share_links"."expires_at" = datetime("climb_list_share_links"."expires_at"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `climb_list_share_links_list_idx` ON `climb_list_share_links` (`user_id`,`list_id`);--> statement-breakpoint
ALTER TABLE `user` ADD `climb_list_visibility` text DEFAULT 'friends' NOT NULL;--> statement-breakpoint
-- Going private revokes every list link, as it does trip and project links.
-- The predicate in db/queries/climb-list-shares.ts also refuses a private
-- owner, which covers a link written in the same moment the profile closed.
-- The body stays flat: see 0048 on nested CASE/END blocks.
CREATE TRIGGER climb_list_share_revoke_on_private AFTER UPDATE OF is_private ON user
WHEN NEW.is_private AND NOT OLD.is_private
BEGIN
  DELETE FROM climb_list_share_links WHERE user_id = NEW.id;
END;