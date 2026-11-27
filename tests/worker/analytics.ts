import assert from "node:assert/strict";

import type { SmokeContext } from "./harness.ts";
import { apiJson } from "./validate-api.ts";

export async function testProfileAnalytics({ server, db, signIn }: SmokeContext) {
  const owner = await signIn("analytics-owner");
  const visitor = await signIn("analytics-visitor");
  const page = "/users/analytics-owner/analytics";
  const api = "/api/pages" + page;
  const read = (cookie: string, query = "") => server.fetch(api + query, { headers: { cookie } });
  async function save(cookie: string, layout: unknown) {
    const res = await server.fetch("/api/actions/saveAnalyticsLayout", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ args: [layout] }),
    });
    assert.equal(res.status, 200);
    return apiJson(res, "/api/actions/saveAnalyticsLayout");
  }

  assert.equal((await server.fetch(api)).status, 401);
  assert.equal((await read(visitor)).status, 404);
  assert.equal((await server.fetch(page, { headers: { cookie: visitor } })).status, 404);
  const signedOut = await server.fetch(page);
  assert.doesNotMatch(await signedOut.text(), /analytics-owner · Analytics/);
  await db
    .prepare(
      "UPDATE user SET is_private=0, journal_visibility='friends' WHERE id='analytics-owner'",
    )
    .run();
  const preview = await server.fetch(page, { headers: { cookie: visitor } });
  assert.match(preview.headers.get("cache-control") ?? "", /private, no-store/);
  assert.match(await preview.text(), /analytics-owner · Analytics/);
  const area = await db
    .prepare("INSERT INTO areas(name) VALUES ('Analytics area') RETURNING id")
    .first<{ id: number }>();
  assert.ok(area);
  const climb = await db
    .prepare(
      "INSERT INTO climbs(area_id,name,type,grade) VALUES(?,'Analytics boulder','boulder',5) RETURNING id",
    )
    .bind(area.id)
    .first<{ id: number }>();
  assert.ok(climb);
  const rope = await db
    .prepare(
      "INSERT INTO climbs(area_id,name,type,grade) VALUES(?,'Analytics route','sport',7) RETURNING id",
    )
    .bind(area.id)
    .first<{ id: number }>();
  assert.ok(rope);
  await db
    .prepare(
      "INSERT INTO sends(user_id,climb_id,suggested_grade,ascent_style) VALUES('analytics-owner',?,7,'onsight')",
    )
    .bind(rope.id)
    .run();
  const fields = [
    ["kind", "session"],
    ["climbId", String(climb.id)],
    ["sent", "on"],
    ["suggestedGrade", "5"],
    ["ascentStyle", "redpoint"],
    ["entryDate", "2025-03-04"],
    ["tag", "project"],
    ["body", "analytics private note"],
  ];
  const log = await server.fetch("/api/actions/createJournalEntry", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: owner },
    body: JSON.stringify({ args: [{ __formData: fields }] }),
  });
  assert.deepEqual(await log.json(), { ok: true });

  assert.deepEqual(await save(owner, { cards: ["firstTry", "sends"], charts: ["volume"] }), {
    ok: true,
  });
  for (const bad of [
    { cards: ["sends", "sends"], charts: [] },
    { cards: ["unknown"], charts: [] },
    { cards: [], charts: ["goal"] },
    { cards: [], charts: [], userId: "other" },
  ]) {
    assert.equal((await save(owner, bad)).ok, false);
  }
  const readPage = (cookie: string, query = "") =>
    apiJson(read(cookie, query), "/api/pages/users/{id}/analytics");
  const full = await readPage(owner);
  assert.deepEqual(full.layout, { cards: ["flash", "onsight", "sends"], charts: ["volume"] });
  assert.equal(full.rows.length, 2);
  assert.equal(full.rows[0].dateSent, null);
  assert.deepEqual(full.tags, ["project"]);
  assert.equal(full.overview.daysOut, 1);
  assert.equal(full.overview.sendCount, 2);
  assert.doesNotMatch(JSON.stringify(full), /analytics private note/);
  const tagged = await readPage(owner, "?tag=%23PROJECT&tag=project");
  assert.deepEqual(
    tagged.rows.map((row) => row.climbId),
    [climb.id],
  );
  assert.deepEqual(
    tagged.highlightSessions?.map((row) => row.entryDate),
    ["2025-03-04"],
  );
  const unseen = await readPage(visitor);
  assert.equal(unseen.layout, null);
  assert.equal(unseen.highlightSessions, null);
  assert.equal(unseen.overview.daysOut, null);
  assert.equal(unseen.rows.length, 2);
  assert.deepEqual(unseen.tags, []);
  assert.deepEqual((await readPage(visitor, "?tag=project")).rows, []);
  await db
    .prepare(
      "INSERT INTO friendships(user_id,friend_id,status,requested_by) VALUES('analytics-owner','analytics-visitor','accepted','analytics-owner')",
    )
    .run();
  assert.deepEqual(
    (await readPage(visitor, "?tag=project")).highlightSessions?.map((r) => r.climbId),
    [climb.id],
  );
  await db.prepare("UPDATE user SET is_private=1 WHERE id='analytics-owner'").run();
  assert.equal((await read(visitor)).status, 404);
}
