-- Areas resolve their subtree and ancestry by walking parent_id at read time
-- (recursive CTEs in db/queries), so the nested-set encoding and the
-- optimistic-concurrency version it was maintained under are both dead.
--
-- SQLite refuses DROP COLUMN while any index, view or trigger references the
-- column, so every index over lft/rght goes first. climbs_lft_rght_idx is
-- hand-written in 0010_climb_sort_indexes.sql rather than declared in the
-- drizzle schema, so `drizzle-kit generate` does not know to emit it — it is
-- added here by hand. The 8 sort indexes from that same migration are
-- untouched: none of them reference lft/rght.
--
-- Nothing else blocks the drop: the FTS triggers (0015) fire on
-- `UPDATE OF name` only, and climbs.avg_rating's generated expression reads
-- only rating_sum/rating_count.
DROP TABLE `tree_version`;--> statement-breakpoint
DROP INDEX `climbs_lft_rght_idx`;--> statement-breakpoint
DROP INDEX `areas_lft_idx`;--> statement-breakpoint
DROP INDEX `areas_rght_idx`;--> statement-breakpoint
ALTER TABLE `areas` DROP COLUMN `lft`;--> statement-breakpoint
ALTER TABLE `areas` DROP COLUMN `rght`;--> statement-breakpoint
ALTER TABLE `climbs` DROP COLUMN `lft`;--> statement-breakpoint
ALTER TABLE `climbs` DROP COLUMN `rght`;
