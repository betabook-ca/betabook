import assert from "node:assert/strict";

export async function testProjects({ server, db, signIn }) {
  const owner = await signIn("project-owner");
  const stranger = await signIn("project-stranger");
  const area = await db
    .prepare("INSERT INTO areas(name) VALUES ('Project area') RETURNING id")
    .first();
  const {
    results: [climb],
  } = await db
    .prepare(
      "INSERT INTO climbs(area_id,name,type,grade) VALUES (?, 'Smoke project', 'boulder', 5) RETURNING id",
    )
    .bind(area.id)
    .all();
  await db.prepare("UPDATE user SET is_private = 0 WHERE id = 'project-owner'").run();

  async function action(name, args, cookie = owner) {
    const res = await server.fetch(`/api/actions/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ args }),
    });
    assert.equal(res.status, 200);
    return res.json();
  }

  assert.deepEqual(await action("pinProject", [climb.id]), { ok: true });
  const boardUrl = "/api/pages/users/project-owner/projects";
  const readBoard = (cookie) => server.fetch(boardUrl, { headers: { cookie } });
  assert.equal((await server.fetch(boardUrl)).status, 401);
  assert.equal((await readBoard(stranger)).status, 404);
  await db
    .prepare(
      "INSERT INTO friendships(user_id,friend_id,status,requested_by) VALUES ('project-owner','project-stranger','accepted','project-owner')",
    )
    .run();
  assert.equal((await readBoard(stranger)).status, 404);
  const memberPage = "/users/project-owner/projects/sent";
  assert.equal((await server.fetch(memberPage, { headers: { cookie: stranger } })).status, 404);
  const ownerPage = await server.fetch(memberPage, { headers: { cookie: owner } });
  assert.equal(ownerPage.status, 200);
  assert.match(await ownerPage.text(), /project-owner · Sent projects/);
  const visitorPage = await server.fetch(memberPage);
  assert.equal(visitorPage.status, 200);
  assert.doesNotMatch(await visitorPage.text(), /project-owner · Sent projects/);
  const ownBoard = await readBoard(owner);
  assert.equal(ownBoard.status, 200);
  assert.equal((await ownBoard.json()).projects[0].climbId, climb.id);
  assert.equal((await action("shareProject", [climb.id, "7d"], stranger)).ok, false);
  const link = await action("shareProject", [climb.id, "never"]);
  assert.equal(link.ok, true);
  const token = link.value.token;
  const api = `/api/pages/projects/${token}`;
  const path = `/projects/${token}`;
  for (const init of [undefined, { headers: { cookie: stranger } }]) {
    const res = await server.fetch(api, init);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).project.climbName, "Smoke project");
  }
  const preview = await server.fetch(path);
  assert.equal(preview.status, 200);
  assert.match(preview.headers.get("cache-control"), /no-store/);
  assert.match(await preview.text(), /owner is projecting Smoke project/);
  await db
    .prepare("UPDATE project_share_links SET expires_at='2000-01-01 00:00:00' WHERE token=?")
    .bind(token)
    .run();
  assert.deepEqual(await (await server.fetch(api)).json(), { status: "expired" });
  assert.doesNotMatch(await (await server.fetch(path)).text(), /Smoke project/);
  assert.equal((await action("shareProject", [climb.id, "30d"])).value.token, token);
  assert.deepEqual(await action("unshareProject", [climb.id]), { ok: true });
  assert.equal((await server.fetch(api)).status, 404);
  const missing = await server.fetch(path);
  assert.equal(missing.status, 404);
  assert.doesNotMatch(await missing.text(), /Smoke project/);
}
