-- Tagging company is about who you climbed with, not about your friend's privacy
-- settings, so an accepted friendship is the whole eligibility rule. Dropping the
-- profile-privacy condition also fixes a save that a private friend used to break:
-- re-saving an entry re-sends its unchanged tags, and BEFORE INSERT runs even where
-- ON CONFLICT DO NOTHING makes the row a no-op, so the old guard aborted the batch.
-- `companionsJsonSql` still withholds a private companion's name from other readers.
DROP TRIGGER journal_companions_insert_guard;
--> statement-breakpoint
CREATE TRIGGER journal_companions_insert_guard BEFORE INSERT ON journal_companions
BEGIN
  SELECT RAISE(ABORT, 'journal companion: unavailable friend')
  WHERE NOT EXISTS (
    SELECT 1 FROM journal_entries j JOIN friendships f
      ON f.user_id = NEW.friendship_user_id AND f.friend_id = NEW.friendship_friend_id
    WHERE j.id = NEW.entry_id AND j.user_id <> NEW.user_id
      AND f.user_id = min(j.user_id, NEW.user_id) AND f.friend_id = max(j.user_id, NEW.user_id)
      AND f.status = 'accepted'
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
