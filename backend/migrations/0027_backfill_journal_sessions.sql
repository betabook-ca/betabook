INSERT INTO journal_entries (user_id, climb_id, kind, entry_date, sent, body, created_at, updated_at)
SELECT s.user_id, s.climb_id, 'session', s.date_sent, 1, s.comment, s.created_at, s.updated_at
FROM sends s
WHERE s.date_sent IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM journal_entries j
    WHERE j.user_id = s.user_id AND j.climb_id = s.climb_id AND j.sent = 1
  );
--> statement-breakpoint
ANALYZE journal_entries;
