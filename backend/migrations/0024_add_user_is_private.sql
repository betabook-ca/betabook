-- Lets a climber hide their profile and sends from everyone but themselves.
-- Defaults every existing account to public (unchanged behavior) and is never
-- read by the sends-aggregate triggers (0014_sends_aggregate_triggers.sql) or
-- the consensus-grade queries in db/queries/sends.ts, both of which read
-- `sends` with no join to `user` — a private user's ascents keep counting
-- toward a climb's rating and suggested grade.
ALTER TABLE `user` ADD `is_private` integer DEFAULT false NOT NULL;