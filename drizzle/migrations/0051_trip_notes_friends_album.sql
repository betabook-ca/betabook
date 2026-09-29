-- Both columns are added in place. Rebuilding `trips` to add a CHECK would
-- drop the table, and that drop cascades into trip_share_links and deletes
-- every link.
ALTER TABLE `trips` ADD `notes` text CONSTRAINT "trips_notes" CHECK("notes" IS NULL OR length("notes") <= 50000);
--> statement-breakpoint
ALTER TABLE `trips` ADD `album_url` text CONSTRAINT "trips_album_url" CHECK("album_url" IS NULL OR length("album_url") <= 300);
--> statement-breakpoint
CREATE TABLE `trip_companions` (
	`trip_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`friendship_user_id` text NOT NULL,
	`friendship_friend_id` text NOT NULL,
	`suppressed` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`trip_id`, `user_id`),
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`friendship_user_id`,`friendship_friend_id`) REFERENCES `friendships`(`user_id`,`friend_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "trip_companions_suppressed_bool" CHECK("trip_companions"."suppressed" IN (0, 1))
);
--> statement-breakpoint
CREATE INDEX `trip_companions_friendship_idx` ON `trip_companions` (`friendship_user_id`,`friendship_friend_id`);--> statement-breakpoint
CREATE INDEX `trip_companions_user_idx` ON `trip_companions` (`user_id`,`trip_id`);--> statement-breakpoint
CREATE INDEX `trip_companions_active_idx` ON `trip_companions` (`trip_id`,`user_id`) WHERE "trip_companions"."suppressed" = 0;--> statement-breakpoint
-- The guards of journal_companions (0036, 0039), over a trip. Conditions stay
-- to facts that cannot change after tagging: a re-saved trip re-sends its
-- unchanged tags, and BEFORE INSERT runs even where ON CONFLICT DO NOTHING
-- makes the row a no-op. Bodies stay flat for the remote D1 migration parser.
CREATE TRIGGER trip_companions_insert_guard BEFORE INSERT ON trip_companions
BEGIN
  SELECT RAISE(ABORT, 'trip companion: unavailable friend')
  WHERE NOT EXISTS (
    SELECT 1 FROM trips t JOIN friendships f
      ON f.user_id = NEW.friendship_user_id AND f.friend_id = NEW.friendship_friend_id
    WHERE t.id = NEW.trip_id AND t.user_id <> NEW.user_id
      AND f.user_id = min(t.user_id, NEW.user_id) AND f.friend_id = max(t.user_id, NEW.user_id)
      AND f.status = 'accepted'
  );
  SELECT RAISE(ABORT, 'trip companion: removed by companion')
  WHERE EXISTS (
    SELECT 1 FROM trip_companions WHERE trip_id = NEW.trip_id AND user_id = NEW.user_id AND suppressed = 1
  );
  SELECT RAISE(ABORT, 'trip companion: too many friends')
  WHERE NEW.suppressed <> 0 OR (
    NOT EXISTS (SELECT 1 FROM trip_companions WHERE trip_id = NEW.trip_id AND user_id = NEW.user_id)
    AND (SELECT count(*) FROM trip_companions WHERE trip_id = NEW.trip_id AND suppressed = 0) >= 10
  );
END;
--> statement-breakpoint
CREATE TRIGGER trip_companions_update_guard BEFORE UPDATE ON trip_companions
BEGIN
  SELECT RAISE(ABORT, 'trip companion: invalid update')
  WHERE NEW.trip_id <> OLD.trip_id OR NEW.user_id <> OLD.user_id
    OR NEW.friendship_user_id <> OLD.friendship_user_id OR NEW.friendship_friend_id <> OLD.friendship_friend_id
    OR NEW.suppressed < OLD.suppressed;
END;
--> statement-breakpoint
CREATE TRIGGER trip_companions_trip_guard BEFORE UPDATE OF user_id ON trips
WHEN NEW.user_id <> OLD.user_id
  AND EXISTS (SELECT 1 FROM trip_companions WHERE trip_id = OLD.id)
BEGIN
  SELECT RAISE(ABORT, 'trip companion: trip owner cannot change');
END;
--> statement-breakpoint
-- A description is one line of at most 160 characters (MAX_TRIP_DESCRIPTION).
-- One written longer cannot be saved again from the trip form, so it becomes
-- the trip's notes. `notes` is new above, so no trip has any to overwrite.
UPDATE trips SET notes = description, description = NULL
WHERE length(description) > 160 AND notes IS NULL;
