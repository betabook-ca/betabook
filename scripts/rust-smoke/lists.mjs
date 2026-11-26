import assert from "node:assert/strict";

export async function testLists({ server, db, signIn }) {
  const owner = await signIn("list-owner");
  const friend = await signIn("list-friend");
  const stranger = await signIn("list-stranger");
  await db.prepare("UPDATE user SET is_private = 0 WHERE id = 'list-owner'").run();
  await db
    .prepare(
      "INSERT INTO friendships(user_id,friend_id,status,requested_by) VALUES('list-friend','list-owner','accepted','list-owner')",
    )
    .run();
  const { id: areaId } = await db
    .prepare("INSERT INTO areas(name) VALUES ('List area') RETURNING id")
    .first();
  const { id: climbId } = await db
    .prepare(
      "INSERT INTO climbs(area_id,name,type,grade) VALUES (?,'List climb','boulder',5) RETURNING id",
    )
    .bind(areaId)
    .first();
  async function action(name, cookie, ...args) {
    const response = await server.fetch(`/api/actions/${name}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ args }),
    });
    assert.equal(response.status, 200);
    return response.json();
  }
  const created = await action("createClimbList", owner, { title: "Bishop circuit" }, { climbId });
  assert.equal(created.ok, true, JSON.stringify(created));
  const listId = created.value.id;
  const memberUrl = `/api/pages/users/list-owner/lists/${listId}`;
  const listPath = `/users/list-owner/lists/${listId}`;
  for (const [path, title] of [
    ["/users/list-owner/lists", "list-owner · Lists"],
    [listPath, "Bishop circuit · list-owner"],
  ]) {
    const permitted = await server.fetch(path, { headers: { cookie: friend } });
    assert.equal(permitted.status, 200);
    assert.ok((await permitted.text()).includes("<title>" + title));
    const refused = await server.fetch(path, { headers: { cookie: stranger } });
    assert.equal(refused.status, 404);
    assert.ok(!(await refused.text()).includes(title));
  }
  assert.equal(
    (await server.fetch("/users/list-owner/lists/999999", { headers: { cookie: owner } })).status,
    404,
  );
  const memberRead = await server.fetch(memberUrl, { headers: { cookie: friend } });
  assert.equal(memberRead.status, 200);
  const member = await memberRead.json();
  assert.equal(member.list.title, "Bishop circuit");
  assert.deepEqual(
    member.page.items.map((c) => c.climbId),
    [climbId],
  );
  assert.equal(member.share, null);
  assert.equal((await server.fetch(memberUrl, { headers: { cookie: stranger } })).status, 404);
  assert.equal((await action("saveClimbListEdits", stranger, listId, [])).ok, false);
  const share = await action("shareClimbList", owner, listId, "7d");
  assert.equal(share.ok, true, JSON.stringify(share));
  const url = `/api/pages/lists/${share.value.token}`;
  const publicUrl = `/lists/${share.value.token}`;
  const html = await server.fetch(publicUrl);
  assert.equal(html.status, 200);
  assert.match(await html.text(), /list-owner · Bishop circuit/);
  const redirect = await server.fetch(publicUrl, {
    headers: { cookie: owner },
    redirect: "manual",
  });
  assert.equal(redirect.status, 307);
  assert.equal(redirect.headers.get("location"), `/users/list-owner/lists/${listId}`);
  const shared = await (await server.fetch(url)).json();
  assert.equal(shared.mode, "shared");
  assert.deepEqual(shared.list, { title: "Bishop circuit", description: null, climbCount: 1 });
  assert.equal(shared.page.items[0].sent, null);
  assert.equal(
    (await action("copyClimbList", stranger, { token: share.value.token }, { title: "My copy" }))
      .ok,
    true,
  );
  await db.prepare("UPDATE user SET terms_accepted_at = NULL WHERE id='list-friend'").run();
  const stale = await (await server.fetch(url, { headers: { cookie: friend } })).json();
  assert.equal(stale.mode, "shared");
  assert.equal(stale.viewerId, null);
  assert.equal(stale.page.items[0].sent, null);
  assert.equal((await action("unshareClimbList", owner, listId)).ok, true);
  assert.equal((await server.fetch(url)).status, 404);
  assert.equal(
    (await action("copyClimbList", stranger, { token: share.value.token }, { title: "Late copy" }))
      .ok,
    false,
  );
}
