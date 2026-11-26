-- Hand-written (see 0001_fts5_search.sql): drizzle-kit doesn't model triggers.
-- Kept in numeric sequence with the generated migrations so
-- `wrangler d1 migrations apply` runs it in order.
--
-- areas_fts/climbs_fts are external-content FTS5 tables, and until now every
-- write path had to remember to mirror its base-table statement into the FTS
-- index by hand. That drifted in practice: renames never touched the index at
-- all, deleteClimb never removed its row, and create/delete paths issued the
-- base write and the index write as two separate D1 statements — so a failure
-- between them left the index out of sync while the base row was already
-- committed. These triggers are the canonical FTS5 external-content pattern:
-- the index update runs inside the very same statement as the base-table
-- write, so it's atomic by construction and no future mutation can forget it.
--
-- The UPDATE triggers fire on `UPDATE OF name` only, so bulk lft/rght
-- rewrites (recomputeAreaTree) and the climbs.send_count/rating_* updates
-- that 0014_sends_aggregate_triggers drives on every send don't churn the
-- index.
--
-- Unlike the sends aggregates in 0014, these triggers have no ON DELETE
-- CASCADE gap to work around: areas.parent_id and climbs.area_id are both
-- ON DELETE RESTRICT, so no area or climb row is ever removed by a cascade
-- that SQLite would skip these DELETE triggers for. Every delete is an
-- explicit statement, which fires them.
--
-- NOTE for future table rebuilds (the 0011 pattern: CREATE __new_x / DROP x /
-- RENAME): DROP TABLE drops these triggers with it — recreate them, and
-- rebuild the index afterwards, just like the hand-written indexes there.
CREATE TRIGGER areas_fts_after_insert AFTER INSERT ON areas BEGIN
  INSERT INTO areas_fts(rowid, name) VALUES (new.id, new.name);
END;
--> statement-breakpoint
CREATE TRIGGER areas_fts_after_delete AFTER DELETE ON areas BEGIN
  INSERT INTO areas_fts(areas_fts, rowid, name) VALUES ('delete', old.id, old.name);
END;
--> statement-breakpoint
CREATE TRIGGER areas_fts_after_update AFTER UPDATE OF name ON areas BEGIN
  INSERT INTO areas_fts(areas_fts, rowid, name) VALUES ('delete', old.id, old.name);
  INSERT INTO areas_fts(rowid, name) VALUES (new.id, new.name);
END;
--> statement-breakpoint
CREATE TRIGGER climbs_fts_after_insert AFTER INSERT ON climbs BEGIN
  INSERT INTO climbs_fts(rowid, name) VALUES (new.id, new.name);
END;
--> statement-breakpoint
CREATE TRIGGER climbs_fts_after_delete AFTER DELETE ON climbs BEGIN
  INSERT INTO climbs_fts(climbs_fts, rowid, name) VALUES ('delete', old.id, old.name);
END;
--> statement-breakpoint
CREATE TRIGGER climbs_fts_after_update AFTER UPDATE OF name ON climbs BEGIN
  INSERT INTO climbs_fts(climbs_fts, rowid, name) VALUES ('delete', old.id, old.name);
  INSERT INTO climbs_fts(rowid, name) VALUES (new.id, new.name);
END;
--> statement-breakpoint
-- Repair whatever drift the manual-sync era already left behind (stale names
-- from renames, phantom rows from unmirrored deletes) by rebuilding both
-- indexes from their content tables.
INSERT INTO areas_fts(areas_fts) VALUES ('rebuild');
--> statement-breakpoint
INSERT INTO climbs_fts(climbs_fts) VALUES ('rebuild');
