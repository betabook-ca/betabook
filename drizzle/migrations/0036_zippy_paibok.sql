CREATE TABLE `journal_companions` (
	`entry_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`friendship_user_id` text NOT NULL,
	`friendship_friend_id` text NOT NULL,
	`suppressed` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`entry_id`, `user_id`),
	FOREIGN KEY (`entry_id`) REFERENCES `journal_entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`friendship_user_id`,`friendship_friend_id`) REFERENCES `friendships`(`user_id`,`friend_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "journal_companions_suppressed_bool" CHECK("journal_companions"."suppressed" IN (0, 1))
);
--> statement-breakpoint
CREATE INDEX `journal_companions_friendship_idx` ON `journal_companions` (`friendship_user_id`,`friendship_friend_id`);--> statement-breakpoint
CREATE INDEX `journal_companions_user_idx` ON `journal_companions` (`user_id`,`entry_id`);--> statement-breakpoint
CREATE INDEX `journal_companions_active_idx` ON `journal_companions` (`entry_id`,`user_id`) WHERE "journal_companions"."suppressed" = 0;--> statement-breakpoint
-- Companions describe company on any journal entry, independently of its outcome.
-- Guards run inside the entry/send batch, including after a concurrent unfriend.
-- Use conditional RAISE statements to avoid nested CASE/END blocks in the
-- remote D1 migration parser, which differs from the local statement splitter.
CREATE TRIGGER journal_companions_insert_guard BEFORE INSERT ON journal_companions
BEGIN
  SELECT RAISE(ABORT, 'journal companion: unavailable friend')
  WHERE NOT EXISTS (
    SELECT 1 FROM journal_entries j JOIN friendships f
      ON f.user_id = NEW.friendship_user_id AND f.friend_id = NEW.friendship_friend_id
    JOIN user u ON u.id = NEW.user_id
    WHERE j.id = NEW.entry_id AND j.user_id <> NEW.user_id
      AND f.user_id = min(j.user_id, NEW.user_id) AND f.friend_id = max(j.user_id, NEW.user_id)
      AND f.status = 'accepted' AND u.is_private = 0
  );
  SELECT RAISE(ABORT, 'journal companion: removed by companion')
  WHERE EXISTS (
    SELECT 1 FROM journal_companions WHERE entry_id = NEW.entry_id AND user_id = NEW.user_id AND suppressed = 1
  );
  SELECT RAISE(ABORT, 'journal companion: too many friends')
  WHERE NEW.suppressed <> 0 OR (
    NOT EXISTS (SELECT 1 FROM journal_companions WHERE entry_id = NEW.entry_id AND user_id = NEW.user_id)
    AND (SELECT count(*) FROM journal_companions WHERE entry_id = NEW.entry_id AND suppressed = 0) >= 10
  );
END;
--> statement-breakpoint
-- A companion remains anchored to the same entry and cannot be unsuppressed.
CREATE TRIGGER journal_companions_update_guard BEFORE UPDATE ON journal_companions
BEGIN
  SELECT RAISE(ABORT, 'journal companion: invalid update')
  WHERE NEW.entry_id <> OLD.entry_id OR NEW.user_id <> OLD.user_id
    OR NEW.friendship_user_id <> OLD.friendship_user_id OR NEW.friendship_friend_id <> OLD.friendship_friend_id
    OR NEW.suppressed < OLD.suppressed;
END;
--> statement-breakpoint
CREATE TRIGGER journal_companions_entry_guard BEFORE UPDATE OF user_id ON journal_entries
WHEN NEW.user_id <> OLD.user_id
  AND EXISTS (SELECT 1 FROM journal_companions WHERE entry_id = OLD.id)
BEGIN
  SELECT RAISE(ABORT, 'journal companion: entry author cannot change');
END;
--> statement-breakpoint
-- A merge moves the matching send first. Keep the original entry ID and its
-- companion/suppression rows instead of recreating the ascent and losing them.
DROP TRIGGER journal_sent_update_guard;
--> statement-breakpoint
CREATE TRIGGER journal_sent_update_guard
BEFORE UPDATE ON journal_entries
WHEN NEW.sent = 1 AND NEW.kind = 'session' AND NEW.climb_id IS NOT NULL AND (
  NOT EXISTS (
    SELECT 1 FROM sends s
    WHERE s.user_id = NEW.user_id AND s.climb_id = NEW.climb_id
      AND (
        (NEW.is_ascent = 1 AND OLD.is_ascent = 1 AND s.date_sent IS NOT NULL
          AND OLD.user_id = NEW.user_id
          AND (
            OLD.climb_id = NEW.climb_id
            OR (
              s.date_sent IS NEW.entry_date AND s.comment IS NEW.body
              AND NOT EXISTS (
                SELECT 1 FROM sends old_send
                WHERE old_send.user_id = OLD.user_id AND old_send.climb_id = OLD.climb_id
              )
            )
          ))
        OR (NEW.is_ascent = 0 AND (s.date_sent IS NULL OR NEW.entry_date >= s.date_sent))
      )
  )
  OR (NEW.is_ascent = 1 AND EXISTS (
    SELECT 1 FROM journal_entries j
    WHERE j.user_id = NEW.user_id AND j.climb_id = NEW.climb_id AND j.sent = 1
      AND j.id <> NEW.id AND j.entry_date < NEW.entry_date
  ))
)
BEGIN
  SELECT RAISE(ABORT, 'journal/send invariant: sent entry requires a matching send');
END;
