CREATE TABLE `journal_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`climb_id` integer,
	`kind` text NOT NULL,
	`sent` integer DEFAULT false NOT NULL,
	`entry_date` text NOT NULL,
	`body` text,
	`tags` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`climb_id`) REFERENCES `climbs`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "journal_kind_valid" CHECK("journal_entries"."kind" IN ('session', 'training')),
	CONSTRAINT "journal_sent_boolean" CHECK("journal_entries"."sent" IN (0, 1)),
	CONSTRAINT "journal_training_shape" CHECK("journal_entries"."kind" <> 'training' OR ("journal_entries"."climb_id" IS NULL AND "journal_entries"."sent" = 0)),
	CONSTRAINT "journal_sent_needs_climb" CHECK("journal_entries"."sent" = 0 OR "journal_entries"."climb_id" IS NOT NULL),
	CONSTRAINT "journal_session_needs_climb" CHECK("journal_entries"."kind" <> 'session' OR "journal_entries"."climb_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX `journal_user_climb_idx` ON `journal_entries` (`user_id`,`climb_id`);--> statement-breakpoint
CREATE INDEX `journal_climb_idx` ON `journal_entries` (`climb_id`);--> statement-breakpoint
ALTER TABLE `user` ADD `journal_visibility` text DEFAULT 'private' NOT NULL;
