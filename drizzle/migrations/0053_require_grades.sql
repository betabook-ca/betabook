-- Every climb has a listed grade and every send a suggested grade.
-- Production had no ungraded climbs when this was written; local and seeded
-- databases do, and those take the lowest grade on their scale (VB or 5.0) as
-- a placeholder. A send without a grade takes its climb's listed grade, as the
-- send form does. Neither column is rebuilt as NOT NULL: dropping `climbs`
-- cascades to pinned_projects and catalog_route_sources, and dropping `sends`
-- would have to re-create every trigger on it. These triggers hold the rule
-- instead, so drizzle still types both columns as nullable.
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
CREATE TRIGGER sends_require_suggested_grade_insert
BEFORE INSERT ON sends
WHEN new.suggested_grade IS NULL
BEGIN
  SELECT RAISE(ABORT, 'suggested grade is required');
END;
--> statement-breakpoint
CREATE TRIGGER sends_require_suggested_grade_update
BEFORE UPDATE OF suggested_grade ON sends
WHEN new.suggested_grade IS NULL
BEGIN
  SELECT RAISE(ABORT, 'suggested grade is required');
END;
