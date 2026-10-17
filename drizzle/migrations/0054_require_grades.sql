-- Every climb has a listed grade and every send a suggested grade.
-- Production had no ungraded climbs when this was written; local and seeded
-- databases do, and those take the lowest grade on their scale (VB or 5.0) as
-- a placeholder. A send without a grade takes its climb's listed grade, as the
-- send form does. Neither column is rebuilt as NOT NULL: dropping `climbs`
-- cascades to pinned_projects and catalog_route_sources, and dropping `sends`
-- would have to re-create every trigger on it. These triggers hold the rule
-- instead, so drizzle still types both columns as nullable.
--
-- Climbs reject a null grade. Sends fill one from the climb instead of
-- rejecting it, because CI applies this migration before the new worker is
-- live: until then the old worker still writes a null suggested grade for a
-- blank imported grade and for a climb break's repeat-only sends, and an
-- abort would fail that whole import or break.
UPDATE climbs SET grade = 0 WHERE grade IS NULL;
--> statement-breakpoint
UPDATE sends
SET suggested_grade = (SELECT grade FROM climbs WHERE climbs.id = sends.climb_id)
WHERE suggested_grade IS NULL;
--> statement-breakpoint
CREATE TRIGGER climbs_require_grade_insert
BEFORE INSERT ON climbs
WHEN new.grade IS NULL
BEGIN
  SELECT RAISE(ABORT, 'climb grade is required');
END;
--> statement-breakpoint
CREATE TRIGGER climbs_require_grade_update
BEFORE UPDATE OF grade ON climbs
WHEN new.grade IS NULL
BEGIN
  SELECT RAISE(ABORT, 'climb grade is required');
END;
--> statement-breakpoint
CREATE TRIGGER sends_fill_suggested_grade_insert
AFTER INSERT ON sends
WHEN new.suggested_grade IS NULL
BEGIN
  UPDATE sends
  SET suggested_grade = (SELECT grade FROM climbs WHERE climbs.id = new.climb_id)
  WHERE id = new.id;
END;
--> statement-breakpoint
CREATE TRIGGER sends_fill_suggested_grade_update
AFTER UPDATE OF suggested_grade ON sends
WHEN new.suggested_grade IS NULL
BEGIN
  UPDATE sends
  SET suggested_grade = (SELECT grade FROM climbs WHERE climbs.id = new.climb_id)
  WHERE id = new.id;
END;
