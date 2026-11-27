PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_sends` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`climb_id` integer NOT NULL,
	`ascent_style` text NOT NULL,
	`date_sent` text,
	`comment` text,
	`rating` integer,
	`suggested_grade` integer,
	`grade_feel` text DEFAULT 'solid' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`climb_id`) REFERENCES `climbs`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_sends`("id", "user_id", "climb_id", "ascent_style", "date_sent", "comment", "rating", "suggested_grade", "grade_feel", "created_at", "updated_at") SELECT "id", "user_id", "climb_id", "ascent_style", "date_sent", "comment", "rating", "suggested_grade", "grade_feel", "created_at", "updated_at" FROM `sends`;--> statement-breakpoint
DROP TABLE `sends`;--> statement-breakpoint
ALTER TABLE `__new_sends` RENAME TO `sends`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `sends_user_climb_unique` ON `sends` (`user_id`,`climb_id`);--> statement-breakpoint
CREATE INDEX `sends_climb_idx` ON `sends` (`climb_id`);--> statement-breakpoint
CREATE INDEX `sends_user_idx` ON `sends` (`user_id`);--> statement-breakpoint
-- The table rebuild above drops hand-written triggers and indexes that
-- drizzle-kit cannot represent. Recreate every one before writes resume.
CREATE INDEX sends_date_desc_idx ON sends (date_sent DESC, id DESC);--> statement-breakpoint
CREATE INDEX sends_user_date_idx ON sends (user_id, date_sent DESC, id ASC);--> statement-breakpoint
CREATE TRIGGER sends_aggregates_ai AFTER INSERT ON sends
BEGIN
  UPDATE climbs SET
    send_count   = send_count + 1,
    rating_sum   = rating_sum + COALESCE(new.rating, 0),
    rating_count = rating_count + (new.rating IS NOT NULL)
  WHERE id = new.climb_id;
END;--> statement-breakpoint
CREATE TRIGGER sends_aggregates_ad AFTER DELETE ON sends
BEGIN
  UPDATE climbs SET
    send_count   = send_count - 1,
    rating_sum   = rating_sum - COALESCE(old.rating, 0),
    rating_count = rating_count - (old.rating IS NOT NULL)
  WHERE id = old.climb_id;
END;--> statement-breakpoint
CREATE TRIGGER sends_aggregates_au AFTER UPDATE ON sends
BEGIN
  UPDATE climbs SET
    send_count   = send_count - 1,
    rating_sum   = rating_sum - COALESCE(old.rating, 0),
    rating_count = rating_count - (old.rating IS NOT NULL)
  WHERE id = old.climb_id;
  UPDATE climbs SET
    send_count   = send_count + 1,
    rating_sum   = rating_sum + COALESCE(new.rating, 0),
    rating_count = rating_count + (new.rating IS NOT NULL)
  WHERE id = new.climb_id;
END;--> statement-breakpoint
-- Even a write path that bypasses updateClimb may not reinterpret existing
-- send grade ordinals under another discipline.
CREATE TRIGGER climbs_reject_type_change_with_sends
BEFORE UPDATE OF type ON climbs
WHEN new.type <> old.type AND EXISTS (
  SELECT 1 FROM sends WHERE sends.climb_id = old.id
)
BEGIN
  SELECT RAISE(ABORT, 'cannot change climb type with logged sends');
END;--> statement-breakpoint
ANALYZE sends;
