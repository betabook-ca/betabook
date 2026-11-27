import assert from "node:assert/strict";

import type { SmokeContext } from "./harness.ts";
import { apiJson } from "./validate-api.ts";

// A table rebuild drops its indexes and triggers unless the migration restores them.
const expected = {
  areas: {
    index: ["areas_name_lower_idx"],
    trigger: [
      "areas_fts_after_delete",
      "areas_fts_after_insert",
      "areas_fts_after_update",
      "areas_reject_parent_cycle_insert",
      "areas_reject_parent_cycle_update",
    ],
  },
  climbs: {
    index: [
      "climbs_avg_rating_asc_idx",
      "climbs_avg_rating_desc_idx",
      "climbs_grade_asc_idx",
      "climbs_grade_desc_idx",
      "climbs_name_asc_idx",
      "climbs_name_desc_idx",
      "climbs_name_lower_idx",
      "climbs_send_count_asc_idx",
      "climbs_send_count_desc_idx",
      "climbs_type_grade_idx",
    ],
    trigger: [
      "climbs_fts_after_delete",
      "climbs_fts_after_insert",
      "climbs_fts_after_update",
      "climbs_reject_type_change_with_sends",
      "climbs_require_grade_insert",
      "climbs_require_grade_update",
    ],
  },
  sends: {
    index: ["sends_user_date_idx"],
    trigger: [
      "sends_aggregates_ad",
      "sends_aggregates_ai",
      "sends_aggregates_au",
      "sends_reject_boulder_onsight_insert",
      "sends_reject_boulder_onsight_update",
      "sends_fill_suggested_grade_insert",
      "sends_fill_suggested_grade_update",
      "send_journal_update_guard",
      "send_journal_delete_sync",
    ],
  },
  journal_entries: {
    index: ["journal_user_date_idx"],
    trigger: ["journal_sent_insert_guard", "journal_sent_update_guard"],
  },
};

export async function testMigrationObjects(db: D1Database) {
  const { results } = await db
    .prepare("SELECT tbl_name, type, name FROM sqlite_master WHERE type IN ('index','trigger')")
    .all();
  const objects = new Set(results.map((row) => [row.tbl_name, row.type, row.name].join("|")));
  for (const [table, types] of Object.entries(expected)) {
    for (const [type, names] of Object.entries(types)) {
      for (const name of names) assert.ok(objects.has([table, type, name].join("|")), name);
    }
  }
  for (const [index, date] of [
    ["sends_user_date_idx", "date_sent"],
    ["journal_user_date_idx", "entry_date"],
  ]) {
    const columns = await db
      .prepare("SELECT name, desc FROM pragma_index_xinfo(?) WHERE key=1 ORDER BY seqno")
      .bind(index)
      .all();
    assert.deepEqual(
      columns.results,
      [
        { name: "user_id", desc: 0 },
        { name: date, desc: 1 },
        { name: "id", desc: 1 },
      ],
      index,
    );
  }
}

export async function testCatalogEdits({ db, server, signIn }: SmokeContext) {
  const owner = "catalog-edits-user";
  await signIn(owner);
  const area = await db
    .prepare("INSERT INTO areas(name) VALUES ('FlintyArea') RETURNING id")
    .first<{ id: number }>();
  assert.ok(area);
  const createClimb = (name: string) =>
    db
      .prepare("INSERT INTO climbs(area_id,name,type,grade) VALUES (?,?,'boulder',5) RETURNING id")
      .bind(area.id, name)
      .first<{ id: number }>();
  const old = await createClimb("FlintyStart");
  const next = await createClimb("FlintyDestination");
  assert.ok(old && next);
  const sent = await db
    .prepare(
      "INSERT INTO sends(user_id,climb_id,ascent_style,date_sent,comment,rating) VALUES (?,?,'flash','2026-03-18','Hidden until shared',3) RETURNING id",
    )
    .bind(owner, old.id)
    .first<{ id: number }>();
  assert.ok(sent);
  const detail = async (id: number) => {
    const response = await server.fetch("/api/public/climbs/" + id);
    assert.equal(response.status, 200);
    return apiJson(response, "/api/public/climbs/{id}");
  };
  const review = async () => (await detail(old.id)).publicSends[0];
  await db
    .prepare(
      "UPDATE user SET is_private=0,send_comment_visibility='everyone',image='/avatar.jpg' WHERE id=?",
    )
    .bind(owner)
    .run();
  const visible = await review();
  assert.deepEqual(
    [visible.userName, visible.userImage, visible.comment, visible.dateSent],
    [owner, "/avatar.jpg", "Hidden until shared", "2026-03-18"],
  );
  for (const [privacy, visibility] of [
    [0, "friends"],
    [1, "everyone"],
  ]) {
    await db
      .prepare("UPDATE user SET is_private=?,send_comment_visibility=? WHERE id=?")
      .bind(privacy, visibility, owner)
      .run();
    const hidden = await review();
    assert.deepEqual(
      [hidden.userName, hidden.userImage, hidden.comment, hidden.dateSent],
      [null, null, null, "2026-03"],
    );
    assert.equal(hidden.rating, 3);
  }
  await db.prepare("UPDATE sends SET climb_id=?,rating=5 WHERE id=?").bind(next.id, sent.id).run();
  const aggregates = async (id: number) => {
    const { climb } = await detail(id);
    return [climb.sendCount, climb.avgRating];
  };
  assert.deepEqual(await aggregates(old.id), [0, null]);
  assert.deepEqual(await aggregates(next.id), [1, 5]);
  await db.prepare("DELETE FROM sends WHERE id=?").bind(sent.id).run();
  assert.deepEqual(await aggregates(next.id), [0, null]);

  // MATCH reads the index itself. Selecting unfiltered content from an FTS5
  // external-content table would mask a missing update or deletion trigger.
  for (const [table, id, before, after] of [
    ["climbs", old.id, "FlintyStart", "QuartzStart"],
    ["areas", area.id, "FlintyArea", "QuartzArea"],
  ] as const) {
    const matches = (name: string) =>
      db
        .prepare(`SELECT rowid FROM ${table}_fts WHERE ${table}_fts MATCH ? AND rowid=?`)
        .bind(name, id)
        .first("rowid");
    assert.equal(await matches(before), id);
    await db.prepare(`UPDATE ${table} SET name=? WHERE id=?`).bind(after, id).run();
    assert.equal(await matches(before), null);
    assert.equal(await matches(after), id);
    if (table === "areas") await db.prepare("DELETE FROM climbs WHERE area_id=?").bind(id).run();
    await db.prepare(`DELETE FROM ${table} WHERE id=?`).bind(id).run();
    assert.equal(await matches(after), null);
  }
}
