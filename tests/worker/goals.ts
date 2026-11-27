import assert from "node:assert/strict";

import type { SmokeContext } from "./harness.ts";
import { type WireArgs, apiJson, postAction } from "./validate-api.ts";

export async function testGoals({ server, db, signIn }: SmokeContext) {
  const id = "goal-owner";
  const owner = await signIn(id);
  const friend = await signIn("goal-friend");
  const path = `/users/${id}/goals`;
  const api = `/api${path}`;
  const overview = `/api/pages${path}`;
  const get = (url: string, cookie: string) => server.fetch(url, { headers: { cookie } });

  assert.equal((await server.fetch(api)).status, 401);
  const html = await get(path, owner);
  assert.equal(html.status, 200);
  assert.match(await html.text(), /goal-owner · Goals/);
  assert.match(html.headers.get("cache-control") ?? "", /private.*no-store/);
  const initial = await apiJson(get(overview, owner), "/api/pages/users/{id}/goals");
  assert.deepEqual(initial.initialActive.goals, []);
  assert.match(initial.today, /^\d{4}-\d{2}-\d{2}$/);
  const input: WireArgs<"saveGoal">[1] = {
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
  const invalid = await postAction(server, owner, "saveGoal", null, {
    ...input,
    timezone: "not-a-zone",
  });
  assert.equal(invalid.ok, false);
  const saved = await postAction(server, owner, "saveGoal", null, input);
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
  const visible = await apiJson(get(api, friend), "/api/users/{id}/goals");
  assert.ok("goals" in visible);
  assert.equal(visible.goals[0].id, goalId);
  assert.equal(visible.goals[0].progress, 0);
  assert.equal((await postAction(server, friend, "deleteGoal", goalId)).ok, false);
  // Use a date from the saved UTC period, independent of the edge's timezone.
  const date = visible.goals[0].today;
  const logged = await postAction(server, owner, "createJournalEntry", {
    __formData: [
      ["kind", "training"],
      ["entryDate", date],
      ["tag", "endurance"],
      ["body", "private goal test note"],
    ],
  });
  assert.equal(logged.ok, true, JSON.stringify(logged));
  const history = await apiJson(get(api + "?view=completed", friend), "/api/users/{id}/goals");
  assert.ok("summary" in history);
  assert.equal(history.summary?.achieved, 1);
  assert.equal(history.celebrations, undefined);
  assert.doesNotMatch(JSON.stringify(history), /private goal test note/);
  const recurring = await apiJson(
    get(api + `?historyId=${goalId}`, owner),
    "/api/users/{id}/goals",
  );
  assert.ok("periods" in recurring);
  assert.equal(recurring.periods[0].completedDate, date);
  assert.deepEqual(
    await apiJson(get(api + "?historyId=1&offset=10001", owner), "/api/users/{id}/goals"),
    {
      periods: [],
      hasMore: false,
    },
  );
  assert.equal((await get(api + "?historyId=1&anchor=invalid", owner)).status, 400);
  assert.equal((await get(api + "?view=other", owner)).status, 400);
  assert.equal((await get(api + "?year=0", owner)).status, 400);
  assert.equal((await get(api + "?historyId=9007199254740992", owner)).status, 400);
  const items = `?goalId=${goalId}&periodStart=${visible.goals[0].periodStart}`;
  assert.deepEqual(await apiJson(get(api + items, friend), "/api/users/{id}/goals"), { items: [] });
  await db
    .prepare("DELETE FROM friendships WHERE user_id='goal-friend' AND friend_id='goal-owner'")
    .run();
  assert.equal((await get(api + items, friend)).status, 404);
  assert.deepEqual(await postAction(server, owner, "deleteGoal", goalId), { ok: true });
  const empty = await apiJson(get(api, owner), "/api/users/{id}/goals");
  assert.ok("goals" in empty);
  assert.deepEqual(empty.goals, []);
}
