-- Bouldering has no onsight/flash distinction: a boulder sent first try is a
-- flash. Boulder sends may only be 'redpoint' or 'flash'; 'onsight' stays a
-- rope-only style. Existing boulder onsights become flashes, and two guards
-- keep new ones out. The app rejects boulder onsights before they reach D1
-- (ascentStylesFor / validateSendInput in lib/sends.ts) and imports coerce
-- them to flash; these triggers are the backstop for every other write path.
--
-- sends_aggregates_au fires on this UPDATE but is net-neutral: climb_id and
-- rating do not change, so climbs.send_count and rating sums stay put.
--
-- CI applies migrations before the worker deploy, so for a few seconds the
-- previously deployed worker can still submit a boulder onsight and will get a
-- generic error from the guard. That window is acceptable.
UPDATE sends SET ascent_style = 'flash'
WHERE ascent_style = 'onsight'
  AND climb_id IN (SELECT id FROM climbs WHERE type = 'boulder');--> statement-breakpoint
CREATE TRIGGER sends_reject_boulder_onsight_insert
BEFORE INSERT ON sends
WHEN new.ascent_style = 'onsight' AND EXISTS (
  SELECT 1 FROM climbs WHERE climbs.id = new.climb_id AND climbs.type = 'boulder'
)
BEGIN
  SELECT RAISE(ABORT, 'boulder sends cannot be onsights');
END;--> statement-breakpoint
CREATE TRIGGER sends_reject_boulder_onsight_update
BEFORE UPDATE OF ascent_style, climb_id ON sends
WHEN new.ascent_style = 'onsight' AND EXISTS (
  SELECT 1 FROM climbs WHERE climbs.id = new.climb_id AND climbs.type = 'boulder'
)
BEGIN
  SELECT RAISE(ABORT, 'boulder sends cannot be onsights');
END;
