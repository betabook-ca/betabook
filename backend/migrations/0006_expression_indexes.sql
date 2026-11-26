-- Hand-written: these are SQLite expression indexes (over LOWER(TRIM(name)),
-- not the plain "name" column), which drizzle-kit's schema DSL doesn't model
-- any better than it models FTS5 virtual tables (see 0001_fts5_search.sql).
-- Kept in numeric sequence with the generated migrations so
-- `wrangler d1 migrations apply` runs it in order.
--
-- db/queries/climbs.ts's findClimbsByNameAndArea filters on
-- LOWER(TRIM(climbs.name)) and LOWER(TRIM(areas.name)) for the CSV import's
-- climb resolution. SQLite can only use an index for that filter if the
-- index itself is built over the exact same expression — a plain index on
-- "name" doesn't help, and without one every call does a full table scan.
CREATE INDEX climbs_name_lower_idx ON climbs (LOWER(TRIM(name)));
--> statement-breakpoint
CREATE INDEX areas_name_lower_idx ON areas (LOWER(TRIM(name)));
