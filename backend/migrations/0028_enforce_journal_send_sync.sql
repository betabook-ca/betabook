INSERT INTO journal_entries (user_id, climb_id, kind, entry_date, sent, body, created_at, updated_at)
SELECT s.user_id, s.climb_id, 'session', s.date_sent, 1, s.comment, s.created_at, s.updated_at
FROM sends s
WHERE s.date_sent IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM journal_entries j
    WHERE j.user_id = s.user_id AND j.climb_id = s.climb_id AND j.sent = 1
  );
--> statement-breakpoint
CREATE TRIGGER journal_sent_insert_guard
BEFORE INSERT ON journal_entries
WHEN NEW.sent = 1 AND NEW.kind = 'session' AND NEW.climb_id IS NOT NULL AND NOT EXISTS (
  SELECT 1
  FROM sends s
  WHERE s.user_id = NEW.user_id
    AND s.climb_id = NEW.climb_id
    AND s.date_sent IS NOT NULL
    AND NEW.entry_date >= s.date_sent
)
BEGIN
  SELECT RAISE(ABORT, 'journal/send invariant: sent entry requires a matching dated send');
END;
--> statement-breakpoint
CREATE TRIGGER journal_sent_update_guard
BEFORE UPDATE ON journal_entries
WHEN NEW.sent = 1 AND NEW.kind = 'session' AND NEW.climb_id IS NOT NULL AND NOT EXISTS (
  SELECT 1
  FROM sends s
  WHERE s.user_id = NEW.user_id
    AND s.climb_id = NEW.climb_id
    AND s.date_sent IS NOT NULL
    AND (
      NEW.entry_date >= s.date_sent
      OR (
        OLD.sent = 1
        AND OLD.user_id = NEW.user_id
        AND OLD.climb_id = NEW.climb_id
        AND OLD.id = (
          SELECT j.id
          FROM journal_entries j
          WHERE j.user_id = OLD.user_id
            AND j.climb_id = OLD.climb_id
            AND j.sent = 1
          ORDER BY j.entry_date, j.id
          LIMIT 1
        )
      )
    )
)
BEGIN
  SELECT RAISE(ABORT, 'journal/send invariant: sent entry requires a matching dated send');
END;
--> statement-breakpoint
CREATE TRIGGER send_journal_update_guard
BEFORE UPDATE OF date_sent, comment ON sends
WHEN EXISTS (
  SELECT 1
  FROM journal_entries j
  WHERE j.user_id = OLD.user_id AND j.climb_id = OLD.climb_id AND j.sent = 1
)
AND (
  NEW.date_sent IS NOT (
    SELECT j.entry_date
    FROM journal_entries j
    WHERE j.user_id = OLD.user_id AND j.climb_id = OLD.climb_id AND j.sent = 1
    ORDER BY j.entry_date, j.id
    LIMIT 1
  )
  OR NEW.comment IS NOT (
    SELECT j.body
    FROM journal_entries j
    WHERE j.user_id = OLD.user_id AND j.climb_id = OLD.climb_id AND j.sent = 1
    ORDER BY j.entry_date, j.id
    LIMIT 1
  )
)
BEGIN
  SELECT RAISE(ABORT, 'journal/send invariant: send must match its earliest sent entry');
END;
--> statement-breakpoint
CREATE TRIGGER send_journal_delete_sync
AFTER DELETE ON sends
BEGIN
  UPDATE journal_entries
  SET sent = 0,
      updated_at = cast(unixepoch('subsecond') * 1000 as integer)
  WHERE user_id = OLD.user_id AND climb_id = OLD.climb_id AND sent = 1;
END;
