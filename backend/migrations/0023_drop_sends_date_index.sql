-- Hand-written, like 0018 which created this index: drizzle-kit doesn't
-- track it (it's a descending index, declared outside drizzle/schema/sends.ts
-- — see the comment there), so dropping it has to be hand-written too.
--
-- sends_date_desc_idx backed getRecentSends, the home page's "recent sends"
-- feed. The feed is gone (the home page now renders the same climb search
-- every other page state does), and nothing else queries sends ordered by
-- `date_sent DESC, id DESC`, so the index is dead weight: ~22 bytes per send
-- row and one extra btree write on every insert, for a query that no longer
-- runs.
DROP INDEX sends_date_desc_idx;--> statement-breakpoint
ANALYZE sends;
