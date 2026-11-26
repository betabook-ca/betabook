-- Keep the original ascent distinct from dated repeats of an undated send.
-- ALTER preserves the existing timeline indexes and foreign keys.
DROP TRIGGER journal_sent_insert_guard;
--> statement-breakpoint
DROP TRIGGER journal_sent_update_guard;
--> statement-breakpoint
DROP TRIGGER send_journal_update_guard;
--> statement-breakpoint
DROP TRIGGER send_journal_delete_sync;
--> statement-breakpoint
ALTER TABLE journal_entries ADD COLUMN is_ascent integer NOT NULL DEFAULT 0
  CONSTRAINT journal_ascent_shape CHECK (is_ascent = 0 OR (is_ascent = 1 AND sent = 1));
--> statement-breakpoint
UPDATE journal_entries AS j
SET is_ascent = 1
WHERE j.sent = 1
  AND EXISTS (
    SELECT 1 FROM sends s
    WHERE s.user_id = j.user_id AND s.climb_id = j.climb_id AND s.date_sent IS NOT NULL
  )
  AND j.id = (
    SELECT e.id FROM journal_entries e
    WHERE e.user_id = j.user_id AND e.climb_id = j.climb_id AND e.sent = 1
    ORDER BY e.entry_date, e.id LIMIT 1
  );
--> statement-breakpoint
CREATE UNIQUE INDEX journal_ascent_unique ON journal_entries (user_id, climb_id) WHERE is_ascent = 1;
--> statement-breakpoint
CREATE TRIGGER journal_sent_insert_guard
BEFORE INSERT ON journal_entries
WHEN NEW.sent = 1 AND NEW.kind = 'session' AND NEW.climb_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM sends s
  WHERE s.user_id = NEW.user_id AND s.climb_id = NEW.climb_id
    AND (
      (NEW.is_ascent = 1 AND s.date_sent IS NEW.entry_date AND s.comment IS NEW.body)
      OR (NEW.is_ascent = 0 AND (s.date_sent IS NULL OR NEW.entry_date >= s.date_sent))
    )
)
BEGIN
  SELECT RAISE(ABORT, 'journal/send invariant: sent entry requires a matching send');
END;
--> statement-breakpoint
CREATE TRIGGER journal_sent_update_guard
BEFORE UPDATE ON journal_entries
WHEN NEW.sent = 1 AND NEW.kind = 'session' AND NEW.climb_id IS NOT NULL AND (
  NOT EXISTS (
    SELECT 1 FROM sends s
    WHERE s.user_id = NEW.user_id AND s.climb_id = NEW.climb_id
      AND (
        (NEW.is_ascent = 1 AND OLD.is_ascent = 1 AND s.date_sent IS NOT NULL
          AND OLD.user_id = NEW.user_id AND OLD.climb_id = NEW.climb_id)
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
--> statement-breakpoint
CREATE TRIGGER send_journal_update_guard
BEFORE UPDATE OF date_sent, comment ON sends
WHEN (
  EXISTS (
    SELECT 1 FROM journal_entries j
    WHERE j.user_id = OLD.user_id AND j.climb_id = OLD.climb_id AND j.is_ascent = 1
      AND (NEW.date_sent IS NOT j.entry_date OR NEW.comment IS NOT j.body)
  )
  OR EXISTS (
    SELECT 1 FROM journal_entries j
    WHERE j.user_id = OLD.user_id AND j.climb_id = OLD.climb_id AND j.sent = 1
      AND NEW.date_sent IS NOT NULL AND j.entry_date < NEW.date_sent
  )
)
BEGIN
  SELECT RAISE(ABORT, 'journal/send invariant: send must match its ascent and precede repeats');
END;
--> statement-breakpoint
CREATE TRIGGER send_journal_delete_sync
AFTER DELETE ON sends
BEGIN
  UPDATE journal_entries
  SET sent = 0, is_ascent = 0,
      updated_at = cast(unixepoch('subsecond') * 1000 as integer)
  WHERE user_id = OLD.user_id AND climb_id = OLD.climb_id AND sent = 1;
END;
