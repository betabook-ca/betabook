import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export async function testImports({ server, db, signIn }) {
  const owner = await signIn("import-smoke");
  const api = (path, cookie) => server.fetch(path, cookie ? { headers: { cookie } } : {});
  const action = async (name, ...args) => {
    const response = await server.fetch("/api/actions/" + name, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: owner },
      body: JSON.stringify({ args }),
    });
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  };
  const html = await api("/account/import", owner);
  assert.equal(html.status, 200);
  assert.match(await html.text(), /Import sends/);
  for (const path of [
    "/api/import/kaya?username=bad%20name&climbTypeId=1",
    "/api/import/mountain-project?userId=0",
  ]) {
    assert.equal((await api(path)).status, 401);
    assert.equal((await api(path, owner)).status, 400);
  }
  const root = await db
    .prepare("INSERT INTO areas(name) VALUES('Import parent') RETURNING id")
    .first();
  const area = await db
    .prepare("INSERT INTO areas(parent_id,name) VALUES(?,'Import crag') RETURNING id")
    .bind(root.id)
    .first();
  const climb = await db
    .prepare(
      "INSERT INTO climbs(area_id,name,type,grade) VALUES(?,'Import fixture','boulder',5) RETURNING id",
    )
    .bind(area.id)
    .first();
  const lookup = await action("resolveImportClimbs", ["  IMPORT FIXTURE "]);
  assert.deepEqual(lookup.value[0].ancestors, [{ id: root.id, name: "Import parent" }]);
  assert.equal(lookup.value[0].total, 1);
  const areaLookup = await action("resolveImportClimbsInAreas", [
    { name: "Import fixture", areaName: "Import parent" },
  ]);
  assert.deepEqual(areaLookup, lookup);
  const row = {
    climbId: climb.id,
    ascentStyle: "onsight",
    gradeText: "V3",
    rating: 4,
    gradeFeel: "solid",
    dateSent: "2025-01-01",
    comment: "First visit",
  };
  const options = { gradeScale: "native", onConflict: "overwrite", batchId: "first-batch" };
  const staleView = await action("importSends", [row], {
    ...options,
    expectedOwnerId: "previous-account",
  });
  assert.deepEqual(staleView, { ok: false, error: "Your account changed. Start a new import." });
  const saved = await db
    .prepare("SELECT COUNT(*) AS n FROM sends WHERE user_id=? AND climb_id=?")
    .bind("import-smoke", climb.id)
    .first("n");
  assert.equal(saved, 0);

  const rows = [row, row, { ...row, climbId: 10000000 }];
  const result = await action("importSends", rows, options);
  assert.deepEqual(result, {
    ok: true,
    value: { imported: 1, overwritten: 0, alreadyLogged: 1, missing: [2], broken: [] },
  });
  const hash = createHash("sha256")
    .update(JSON.stringify({ rows, gradeScale: "native", onConflict: "overwrite" }))
    .digest("hex");
  assert.equal(
    (
      await db
        .prepare(
          "SELECT request_hash FROM import_batches WHERE user_id='import-smoke' AND batch_id='first-batch'",
        )
        .first()
    ).request_hash,
    hash,
  );
  const select = () =>
    db
      .prepare(
        "SELECT s.suggested_grade AS grade,s.ascent_style AS style,s.date_sent AS date,j.entry_date AS journalDate,j.body FROM sends s JOIN journal_entries j ON j.user_id=s.user_id AND j.climb_id=s.climb_id AND j.is_ascent=1 WHERE s.user_id='import-smoke' AND s.climb_id=?",
      )
      .bind(climb.id)
      .first();
  assert.deepEqual(await select(), {
    grade: 4,
    style: "flash",
    date: "2025-01-01",
    journalDate: "2025-01-01",
    body: "First visit",
  });
  const edited = { ...row, gradeText: null, dateSent: "2025-01-02", comment: "Updated" };
  const changed = await action("importSends", [edited], { ...options, batchId: "second-batch" });
  assert.equal(changed.value.overwritten, 1);
  assert.deepEqual(await action("importSends", rows, options), result);
  assert.deepEqual(await select(), {
    grade: 4,
    style: "flash",
    date: "2025-01-02",
    journalDate: "2025-01-02",
    body: "Updated",
  });
  assert.equal((await action("importSends", [edited], options)).ok, false);
  await db.prepare("UPDATE climbs SET broken_on='2025-01-03' WHERE id=?").bind(climb.id).run();
  const denied = await action("importSends", [{ ...edited, dateSent: "2025-01-03" }], {
    ...options,
    batchId: "broken",
  });
  assert.deepEqual(denied.value.broken, [0]);
  assert.equal(denied.value.overwritten, 0);
}
