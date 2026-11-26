-- Per-account grading systems: which scale a climber reads and picks boulder
-- grades in (Hueco or Fontainebleau) and route grades in (YDS or French).
-- Display only — climbs.grade, sends.suggested_grade and goals.grade stay
-- native ordinals, so no stored grade changes with these. Values and parsing
-- live in lib/grade-preferences.ts; lib/grades.ts documents the conversion.
--
-- Both columns are additive with the native defaults, so the previously
-- deployed worker keeps reading and writing `user` rows unchanged while CI
-- applies this ahead of the deploy.
ALTER TABLE `user` ADD `boulder_grade_scale` text DEFAULT 'hueco' NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `rope_grade_scale` text DEFAULT 'yds' NOT NULL;
