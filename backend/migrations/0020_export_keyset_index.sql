-- 0019 introduced keyset pagination for full-history CSV exports, but its
-- mixed date DESC / id ASC index required an OR predicate to move past a
-- dated cursor. SQLite could then constrain only user_id, rescanning every
-- previously exported row on later pages.
--
-- Matching both sort directions makes the dated phase a direct row-value
-- range seek: (date_sent, id) < (?, ?). The query handles NULL dates as a
-- separate equality/range seek, so neither phase needs the plan-breaking OR.
DROP INDEX sends_user_date_idx;--> statement-breakpoint
CREATE INDEX sends_user_date_idx ON sends (user_id, date_sent DESC, id DESC);--> statement-breakpoint
ANALYZE sends;
