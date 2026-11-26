CREATE TABLE `trip_share_links` (
	`token` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`user_id` text NOT NULL,
	`trip_id` integer NOT NULL,
	`expires_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`trip_id`) REFERENCES `trips`(`user_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "trip_share_links_expires_at_format" CHECK("trip_share_links"."expires_at" IS NULL OR "trip_share_links"."expires_at" = datetime("trip_share_links"."expires_at"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trip_share_links_trip_idx` ON `trip_share_links` (`user_id`,`trip_id`);
--> statement-breakpoint
-- Going private revokes every trip link, the same way it revokes project
-- links. The predicate in db/queries/trip-shares.ts also refuses a private
-- owner, which covers the one case this cannot: a link written in the same
-- moment the profile was closing.
--
-- The body stays flat. The remote D1 migration parser and the local statement
-- splitter disagree on nested CASE/END blocks, which 0048 records.
CREATE TRIGGER trip_share_revoke_on_private AFTER UPDATE OF is_private ON user
WHEN NEW.is_private AND NOT OLD.is_private
BEGIN
  DELETE FROM trip_share_links WHERE user_id = NEW.id;
END;
