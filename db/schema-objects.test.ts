import { env } from "cloudflare:test";
import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { createDb, type Database } from "@/db/client";

let db: Database;

beforeAll(() => {
  db = createDb(env.DB);
});

// Table rebuilds drop handwritten indexes and triggers absent from drizzle-kit's
// snapshots. Restore missing objects in the migration instead of changing this list.
const HAND_WRITTEN_OBJECTS = [
  "areas|index|areas_name_lower_idx",
  "areas|trigger|areas_fts_after_delete",
  "areas|trigger|areas_fts_after_insert",
  "areas|trigger|areas_fts_after_update",
  "areas|trigger|areas_reject_parent_cycle_insert",
  "areas|trigger|areas_reject_parent_cycle_update",
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
  "sends|index|sends_user_date_idx",
  "sends|trigger|sends_aggregates_ad",
  "sends|trigger|sends_aggregates_ai",
  "sends|trigger|sends_aggregates_au",
  "sends|trigger|sends_reject_boulder_onsight_insert",
  "sends|trigger|sends_reject_boulder_onsight_update",
  "journal_entries|index|journal_user_date_idx",
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

  // Matching ORDER BY directions avoids a separate sort after the index scan.
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
