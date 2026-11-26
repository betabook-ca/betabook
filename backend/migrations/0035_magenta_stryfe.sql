CREATE TABLE `friendships` (
	`user_id` text NOT NULL,
	`friend_id` text NOT NULL,
	`requested_by` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`user_id`, `friend_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`friend_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requested_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "friendships_ordered_pair" CHECK("friendships"."user_id" < "friendships"."friend_id"),
	CONSTRAINT "friendships_requester_is_member" CHECK("friendships"."requested_by" IN ("friendships"."user_id", "friendships"."friend_id")),
	CONSTRAINT "friendships_valid_status" CHECK("friendships"."status" IN ('pending', 'accepted'))
);
--> statement-breakpoint
CREATE INDEX `friendships_friend_idx` ON `friendships` (`friend_id`);
--> statement-breakpoint
ALTER TABLE `user` ADD `send_comment_visibility` text DEFAULT 'public' NOT NULL;
--> statement-breakpoint
-- Replace the column to change its SQLite default without rebuilding user
-- and its foreign-key relationships. Preserve every saved journal audience.
ALTER TABLE `user` RENAME COLUMN `journal_visibility` TO `saved_journal_visibility`;
--> statement-breakpoint
ALTER TABLE `user` ADD `journal_visibility` text DEFAULT 'friends' NOT NULL;
--> statement-breakpoint
UPDATE `user` SET `journal_visibility` = `saved_journal_visibility`;
--> statement-breakpoint
ALTER TABLE `user` DROP COLUMN `saved_journal_visibility`;
--> statement-breakpoint
ALTER TABLE `journal_entries` ADD `is_send_comment` integer DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE journal_entries SET is_send_comment = 1 WHERE is_ascent = 1;
--> statement-breakpoint
-- The note remains send commentary even if deleting/merging its send later
-- changes the entry into a session. All write paths share this classification.
CREATE TRIGGER journal_send_comment_insert
AFTER INSERT ON journal_entries
WHEN NEW.is_ascent = 1 AND NEW.is_send_comment = 0
BEGIN
  UPDATE journal_entries SET is_send_comment = 1 WHERE id = NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER journal_send_comment_update
AFTER UPDATE OF is_ascent, is_send_comment ON journal_entries
WHEN NEW.is_ascent = 1 AND NEW.is_send_comment = 0
BEGIN
  UPDATE journal_entries SET is_send_comment = 1 WHERE id = NEW.id;
END;
