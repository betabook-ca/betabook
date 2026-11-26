-- Hand-written (see 0015_fts_sync_triggers.sql): drizzle-kit doesn't model
-- triggers. Kept in numeric sequence with the generated migrations so
-- `wrangler d1 migrations apply` runs it in order.
--
-- areas is a tree, and every subtree/ancestor query walks parent_id through a
-- recursive CTE with UNION ALL (subtreeAreaIds and findClimbsByNameAndArea in
-- db/queries/climbs.ts; getAncestors, getAreaBreadcrumbs and searchAreas in
-- db/queries/areas.ts). UNION ALL doesn't dedup, so those walks only
-- terminate because the data is acyclic: a single cyclic parent_id edge turns
-- an unbounded walk into an infinite one, and the query runs until D1's 30s
-- limit kills it.
--
-- Until now nothing enforced that. It held only as an emergent property of
-- the write paths — createArea assigns parent_id once, to an already-existing
-- row, so a brand-new id can't be anyone's ancestor; updateArea can't write
-- parent_id at all because validateAreaInput returns only {name, description}.
-- True today, but nothing said so, and the read side had no defense if it
-- ever stopped being true.
--
-- These triggers make it an invariant of the table instead. A parent_id write
-- is rejected iff the row is reachable from its own new parent, which is
-- exactly the condition "this edge closes a cycle" — so acyclic reparenting
-- (moving an area under a different parent) stays legal, while every write
-- that would create a cycle aborts. Enforced in the database rather than in
-- db/mutations/areas.ts so a raw statement, a future mutation, or an import
-- script can't route around it.
--
-- AFTER, not BEFORE: a BEFORE INSERT trigger sees new.id as NULL for an
-- AUTOINCREMENT primary key that the statement didn't supply, so the check
-- would silently pass on exactly the inserts it's meant to cover. RAISE(ABORT)
-- from an AFTER trigger still rolls the statement back.
--
-- UNION, not UNION ALL, inside the guard itself — the one place in this
-- schema where the distinction is load-bearing. The guard's whole job is to
-- run against data that might already contain a cycle (a row written before
-- this migration, or by a statement that predates it); with UNION ALL the
-- check would hang on precisely the input it exists to reject. Deduping caps
-- the walk at one row per area, so it terminates either way.
--
-- Cost is a walk up one ancestor chain — bounded by tree depth, a handful of
-- levels, riding areas_parent_idx — and only on area writes, which are user
-- actions rather than a hot loop. It does not touch any read path.
--
-- NOTE for future table rebuilds (the 0011 pattern: CREATE __new_x / DROP x /
-- RENAME): DROP TABLE drops these triggers with it — recreate them, exactly
-- like the FTS triggers in 0015.
CREATE TRIGGER areas_reject_parent_cycle_insert
AFTER INSERT ON areas WHEN new.parent_id IS NOT NULL BEGIN
  SELECT RAISE(ABORT, 'area parent_id would create a cycle')
  WHERE EXISTS (
    WITH RECURSIVE ancestors(id) AS (
      SELECT new.parent_id
      UNION
      SELECT areas.parent_id FROM areas
      JOIN ancestors ON areas.id = ancestors.id
      WHERE areas.parent_id IS NOT NULL
    )
    SELECT 1 FROM ancestors WHERE id = new.id
  );
END;
--> statement-breakpoint
CREATE TRIGGER areas_reject_parent_cycle_update
AFTER UPDATE OF parent_id ON areas WHEN new.parent_id IS NOT NULL BEGIN
  SELECT RAISE(ABORT, 'area parent_id would create a cycle')
  WHERE EXISTS (
    WITH RECURSIVE ancestors(id) AS (
      SELECT new.parent_id
      UNION
      SELECT areas.parent_id FROM areas
      JOIN ancestors ON areas.id = ancestors.id
      WHERE areas.parent_id IS NOT NULL
    )
    SELECT 1 FROM ancestors WHERE id = new.id
  );
END;
--> statement-breakpoint
-- The triggers only bind writes from here on, so prove the invariant actually
-- holds right now rather than asserting it. The reasoning above says a cycle
-- can't already exist — but that reasoning is precisely what this migration
-- exists to stop depending on, and the failure it would leave behind is the
-- worst kind to debug: reads that hang until D1's 30s limit instead of
-- erroring. Better to fail the deploy.
--
-- A no-op self-assignment, which suffices because `UPDATE OF parent_id` fires
-- on the SET clause naming the column, not on the value changing — so every
-- existing edge runs through the guard just installed above, and the check
-- can't drift from what it's checking. Nothing else fires: the FTS triggers
-- (0015) are `UPDATE OF name`, and climbs.avg_rating's generated expression
-- doesn't read areas.
--
-- Costs one depth-bounded ancestor walk per non-root area, once, at migration
-- time.
UPDATE areas SET parent_id = parent_id WHERE parent_id IS NOT NULL;
