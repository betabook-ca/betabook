-- Hand-written: SQLite's CREATE INDEX has no NULLS FIRST/LAST syntax (only
-- ORDER BY does), so an ascending index is implicitly NULLS-FIRST and a
-- descending index NULLS-LAST. Every "_asc" sort in
-- db/queries/climbs.ts's SUBTREE_CLIMBS_ORDER_BY that wants NULLS LAST
-- (grade_asc, rating_asc) needs the `(col IS NULL), col` expression-index
-- idiom instead of a plain ascending index, matching the same expression
-- text used in that file's ORDER BY clause structurally, or SQLite won't
-- recognize the index as satisfying the ORDER BY.
--
-- climbs_lft_rght_idx supports the subtree range filter directly on climbs
-- (no join to areas); the rest support each of getSubtreeClimbs's 8 sort
-- orders so a large-area query can index-order-scan-with-early-LIMIT
-- instead of sorting the full matching set.
CREATE INDEX climbs_lft_rght_idx ON climbs (lft, rght);
--> statement-breakpoint
CREATE INDEX climbs_name_asc_idx ON climbs (name ASC, id ASC);
--> statement-breakpoint
CREATE INDEX climbs_name_desc_idx ON climbs (name DESC, id ASC);
--> statement-breakpoint
CREATE INDEX climbs_grade_asc_idx ON climbs ((grade IS NULL), grade, id);
--> statement-breakpoint
CREATE INDEX climbs_grade_desc_idx ON climbs (grade DESC, id ASC);
--> statement-breakpoint
CREATE INDEX climbs_send_count_asc_idx ON climbs (send_count ASC, id ASC);
--> statement-breakpoint
CREATE INDEX climbs_send_count_desc_idx ON climbs (send_count DESC, id ASC);
--> statement-breakpoint
CREATE INDEX climbs_avg_rating_asc_idx ON climbs ((avg_rating IS NULL), avg_rating, id);
--> statement-breakpoint
CREATE INDEX climbs_avg_rating_desc_idx ON climbs (avg_rating DESC, id ASC);
--> statement-breakpoint
ANALYZE climbs;
--> statement-breakpoint
ANALYZE areas;
