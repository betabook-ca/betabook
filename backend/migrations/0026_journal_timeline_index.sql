CREATE INDEX journal_user_date_idx ON journal_entries (user_id, entry_date DESC, id DESC);
--> statement-breakpoint
ANALYZE journal_entries;
