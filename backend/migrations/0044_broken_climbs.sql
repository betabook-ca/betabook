-- A climb can be reported broken through a climb_break change request. On
-- approval, broken_on records the ISO date it broke and a post-break climb
-- is created alongside it. From then on, only ascents dated strictly before
-- broken_on may be logged on the original: undated rows cannot be shown to
-- predate the break, so they are rejected too.
--
-- The application enforces this with friendly errors (assertLoggableOnClimb);
-- these triggers are the backstop for imports, merges and any future write
-- path. Rows that already exist keep their dates: the UPDATE triggers watch
-- only date and climb changes, so a legacy undated send on a broken climb can
-- still have its rating or comment edited.
ALTER TABLE `climbs` ADD `broken_on` text;--> statement-breakpoint
CREATE TRIGGER sends_reject_after_break_insert
BEFORE INSERT ON sends
WHEN EXISTS (
  SELECT 1 FROM climbs c
  WHERE c.id = NEW.climb_id AND c.broken_on IS NOT NULL
    AND (NEW.date_sent IS NULL OR NEW.date_sent >= c.broken_on)
)
BEGIN
  SELECT RAISE(ABORT, 'broken climb: sends must be dated before broken_on');
END;--> statement-breakpoint
CREATE TRIGGER sends_reject_after_break_update
BEFORE UPDATE OF date_sent, climb_id ON sends
WHEN (NEW.date_sent IS NOT OLD.date_sent OR NEW.climb_id <> OLD.climb_id) AND EXISTS (
  SELECT 1 FROM climbs c
  WHERE c.id = NEW.climb_id AND c.broken_on IS NOT NULL
    AND (NEW.date_sent IS NULL OR NEW.date_sent >= c.broken_on)
)
BEGIN
  SELECT RAISE(ABORT, 'broken climb: sends must be dated before broken_on');
END;--> statement-breakpoint
CREATE TRIGGER journal_reject_after_break_insert
BEFORE INSERT ON journal_entries
WHEN NEW.climb_id IS NOT NULL AND EXISTS (
  SELECT 1 FROM climbs c
  WHERE c.id = NEW.climb_id AND c.broken_on IS NOT NULL AND NEW.entry_date >= c.broken_on
)
BEGIN
  SELECT RAISE(ABORT, 'broken climb: journal entries must be dated before broken_on');
END;--> statement-breakpoint
CREATE TRIGGER journal_reject_after_break_update
BEFORE UPDATE OF entry_date, climb_id ON journal_entries
WHEN NEW.climb_id IS NOT NULL
  AND (NEW.entry_date <> OLD.entry_date OR NEW.climb_id IS NOT OLD.climb_id)
  AND EXISTS (
    SELECT 1 FROM climbs c
    WHERE c.id = NEW.climb_id AND c.broken_on IS NOT NULL AND NEW.entry_date >= c.broken_on
  )
BEGIN
  SELECT RAISE(ABORT, 'broken climb: journal entries must be dated before broken_on');
END;
