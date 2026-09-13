import { env } from "cloudflare:test";
import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { createDb, type Database } from "@/db/client";

let db: Database;

beforeAll(() => {
  db = createDb(env.DB);
});

/** Everything on these tables that drizzle-kit cannot model, and therefore
 * cannot see: descending and expression indexes, and every trigger.
 *
 * This exists because of a specific, silent failure. `drizzle-kit generate`
 * diffs the newest `drizzle/migrations/meta/*_snapshot.json` against the TS
 * schema, and SQLite cannot ALTER a foreign key — so a one-line change like
 * 0019's `cascade` -> `restrict` on sends.climbId emits a full 12-statement
 * table rebuild. The rebuild drops every object below, and the snapshot never
 * knew they existed: 0019_snapshot.json lists exactly three indexes on
 * `sends` and no triggers at all. 0019 hand-restores them, but nothing
 * *enforces* that the next rebuild does, and neither drizzle-kit nor a
 * passing type-check will say a word. The symptom is silent too — a query
 * that depended on one of these reverts to a full table scan, which is
 * correct and just slow.
 *
 * So: if a new migration makes this fail, do not update the expectations to
 * match. Add the missing CREATEs to that migration. */
const HAND_WRITTEN_OBJECTS = [
  // 0015 FTS sync triggers, 0017 cycle guards, 0006 expression index.
  "areas|index|areas_name_lower_idx",
  "areas|trigger|areas_fts_after_delete",
  "areas|trigger|areas_fts_after_insert",
  "areas|trigger|areas_fts_after_update",
  "areas|trigger|areas_reject_parent_cycle_insert",
  "areas|trigger|areas_reject_parent_cycle_update",
  // 0010's nine sort indexes, 0006's expression index, 0015's FTS triggers,
  // and 0019's discipline-change guard.
  "climbs|index|climbs_avg_rating_asc_idx",
  "climbs|index|climbs_avg_rating_desc_idx",
  "climbs|index|climbs_grade_asc_idx",
  "climbs|index|climbs_grade_desc_idx",
  "climbs|index|climbs_name_asc_idx",
  "climbs|index|climbs_name_desc_idx",
  "climbs|index|climbs_name_lower_idx",
  "climbs|index|climbs_send_count_asc_idx",
  "climbs|index|climbs_send_count_desc_idx",
  "climbs|index|climbs_type_grade_idx",
  "climbs|trigger|climbs_fts_after_delete",
  "climbs|trigger|climbs_fts_after_insert",
  "climbs|trigger|climbs_fts_after_update",
  "climbs|trigger|climbs_reject_type_change_with_sends",
  // 0020's export index, 0014's aggregate triggers.
  "sends|index|sends_user_date_idx",
  "sends|trigger|sends_aggregates_ad",
  "sends|trigger|sends_aggregates_ai",
  "sends|trigger|sends_aggregates_au",
  // 0042's boulder-onsight guards.
  "sends|trigger|sends_reject_boulder_onsight_insert",
  "sends|trigger|sends_reject_boulder_onsight_update",
  "journal_entries|index|journal_user_date_idx",
  // 0028's journal/send consistency triggers must survive table rebuilds.
  "journal_entries|trigger|journal_sent_insert_guard",
  "journal_entries|trigger|journal_sent_update_guard",
  "sends|trigger|send_journal_update_guard",
  "sends|trigger|send_journal_delete_sync",
];

describe("schema objects drizzle-kit cannot model", () => {
  it("all survive a full migration run", async () => {
    const rows = await db.all<{ type: string; name: string; tbl: string }>(sql`
      SELECT type, name, tbl_name AS tbl FROM sqlite_master
      WHERE type IN ('index', 'trigger')
        AND tbl_name IN ('areas', 'climbs', 'sends', 'journal_entries')
        AND name NOT LIKE 'sqlite_%'
      ORDER BY tbl_name, type, name
    `);
    const present = new Set(rows.map((row) => `${row.tbl}|${row.type}|${row.name}`));
    expect([...HAND_WRITTEN_OBJECTS].filter((name) => !present.has(name))).toEqual([]);
  });

  // Direction is the whole point of this index and the only part of it a
  // rebuild can get subtly wrong: SQLite drops the sort only when an index
  // matches the ORDER BY exactly, and silently sorts when it doesn't.
  it.each([
    ["sends_user_date_idx", ["user_id ASC", "date_sent DESC", "id DESC"]],
    ["journal_user_date_idx", ["user_id ASC", "entry_date DESC", "id DESC"]],
  ])("%s keeps its column directions", async (index, expected) => {
    const columns = await db.all<{ name: string | null; desc: number; key: number }>(
      sql`SELECT name, desc, key FROM pragma_index_xinfo(${index})`,
    );
    const keyColumns = columns
      .filter((column) => column.key === 1)
      .map((column) => `${column.name} ${column.desc ? "DESC" : "ASC"}`);
    expect(keyColumns).toEqual(expected);
  });
});
