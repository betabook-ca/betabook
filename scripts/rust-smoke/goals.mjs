import assert from "node:assert/strict";

export async function testGoals({ server, db, signIn }) {
  const id = "goal-owner";
  const owner = await signIn(id);
  const friend = await signIn("goal-friend");
  const path = `/users/${id}/goals`;
  const api = `/api${path}`;
  const overview = `/api/pages${path}`;
  const get = (url, cookie) => server.fetch(url, { headers: { cookie } });
  async function action(cookie, name, ...args) {
    const res = await server.fetch(`/api/actions/${name}`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ args }),
    });
    assert.equal(res.status, 200);
    return res.json();
  }
  assert.equal((await server.fetch(api)).status, 401);
  const html = await get(path, owner);
  assert.equal(html.status, 200);
  assert.match(await html.text(), /goal-owner · Goals/);
  assert.match(html.headers.get("cache-control"), /private.*no-store/);
  const initial = await (await get(overview, owner)).json();
  assert.deepEqual(initial.initialActive.goals, []);
  assert.match(initial.today, /^\d{4}-\d{2}-\d{2}$/);
  const input = {
    kind: "training",
    target: 1,
    timeframe: "month",
    repeat: "month",
    timezone: "UTC",
    discipline: null,
    grade: null,
    endDate: initial.today,
    tags: ["endurance"],
  };
  const invalid = await action(owner, "saveGoal", null, { ...input, timezone: "not-a-zone" });
  assert.equal(invalid.ok, false);
  const saved = await action(owner, "saveGoal", null, input);
  assert.equal(saved.ok, true, JSON.stringify(saved));
  const goalId = saved.value;
  assert.equal((await get(api, friend)).status, 404);
  await db
    .prepare("UPDATE user SET is_private=0, journal_visibility='friends' WHERE id=?")
    .bind(id)
    .run();
  await db
    .prepare(
      "INSERT INTO friendships(user_id,friend_id,status,requested_by) VALUES ('goal-friend','goal-owner','accepted','goal-owner')",
    )
    .run();
  assert.equal((await get(path, friend)).status, 404);
  assert.equal((await get(overview, friend)).status, 404);
  const visible = await (await get(api, friend)).json();
  assert.equal(visible.goals[0].id, goalId);
  assert.equal(visible.goals[0].progress, 0);
  assert.equal((await action(friend, "deleteGoal", goalId)).ok, false);
  // Use a date from the saved UTC period, independent of the edge's timezone.
  const date = visible.goals[0].today;
  const logged = await action(owner, "createJournalEntry", {
    __formData: [
      ["kind", "training"],
      ["entryDate", date],
      ["tag", "endurance"],
      ["body", "private goal test note"],
    ],
  });
  assert.equal(logged.ok, true, JSON.stringify(logged));
  const history = await (await get(api + "?view=completed", friend)).json();
  assert.equal(history.summary.achieved, 1);
  assert.equal(history.celebrations, undefined);
  assert.doesNotMatch(JSON.stringify(history), /private goal test note/);
  const recurring = await (await get(api + `?historyId=${goalId}`, owner)).json();
  assert.equal(recurring.periods[0].completedDate, date);
  assert.deepEqual(await (await get(api + "?historyId=1&offset=10001", owner)).json(), {
    periods: [],
    hasMore: false,
  });
  assert.equal((await get(api + "?historyId=1&anchor=invalid", owner)).status, 400);
  assert.equal((await get(api + "?view=other", owner)).status, 400);
  assert.equal((await get(api + "?year=0", owner)).status, 400);
  assert.equal((await get(api + "?historyId=9007199254740992", owner)).status, 400);
  const items = `?goalId=${goalId}&periodStart=${visible.goals[0].periodStart}`;
  assert.deepEqual(await (await get(api + items, friend)).json(), { items: [] });
  await db
    .prepare("DELETE FROM friendships WHERE user_id='goal-friend' AND friend_id='goal-owner'")
    .run();
  assert.equal((await get(api + items, friend)).status, 404);
  assert.deepEqual(await action(owner, "deleteGoal", goalId), { ok: true });
  assert.deepEqual((await (await get(api, owner)).json()).goals, []);
}
