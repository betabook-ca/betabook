import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

import { required } from "./harness.ts";
import type { SmokeContext } from "./harness.ts";
import { type WireArgs, apiJson, postAction } from "./validate-api.ts";

export async function testGoalRefresh({ server, db, signIn }: SmokeContext) {
  const owner = await signIn("refresh-owner");
  const friend = await signIn("refresh-friend");
  await db
    .prepare("UPDATE user SET is_private=0, journal_visibility='friends' WHERE id='refresh-owner'")
    .run();
  await db
    .prepare(
      "INSERT INTO friendships(user_id,friend_id,status,requested_by) VALUES('refresh-friend','refresh-owner','accepted','refresh-owner')",
    )
    .run();
  const id = required(
    await db
      .prepare(
        "INSERT INTO goals(user_id,kind,target,timeframe,repeat,start_date,end_date,timezone,celebrations_initialized) VALUES('refresh-owner','training',1,'month','none','2025-01-01','2025-01-31','Pacific/Kiritimati',1) RETURNING id",
      )
      .first<number>("id"),
  );

  // waitUntil work is independent of the HTTP response. Poll for the actual
  // committed state so the test also catches a refresh that was never scheduled.
  async function waitForCompletions(expected: number) {
    const deadline = Date.now() + 10_000;
    let count;
    do {
      count = await db
        .prepare("SELECT count(*) AS count FROM goal_completions WHERE goal_id=?")
        .bind(id)
        .first<number>("count");
      if (count === expected) return;
      await delay(50);
    } while (Date.now() < deadline);
    assert.equal(count, expected, "owner activity should reconcile stored events");
  }
  async function friendGoals(query = "") {
    const response = await server.fetch("/api/feed" + query, { headers: { cookie: friend } });
    assert.equal(response.status, 200);
    const { days } = await apiJson(response, "/api/feed");
    return days
      .filter((day) => day.userId === "refresh-owner")
      .flatMap((day) => day.activities)
      .filter((activity) => activity.kind === "goal");
  }
  const log = () =>
    postAction(server, owner, "createJournalEntry", {
      __formData: [
        ["kind", "training"],
        ["entryDate", "2025-01-05"],
        ["body", "Private note"],
      ],
    });
  assert.deepEqual(await log(), { ok: true });
  await waitForCompletions(1);
  const [event] = await friendGoals();
  assert.equal(event?.goalTitle, "Train 1 time");
  assert.equal(event.body, null);
  assert.deepEqual(await friendGoals("?view=sends"), []);
  assert.deepEqual(
    await postAction(server, owner, "acknowledgeGoalAchievements", [
      { id, periodStart: "bad-date", repeat: "none" },
    ]),
    { ok: false, error: "Invalid achievements." },
  );
  const keys: WireArgs<"acknowledgeGoalAchievements">[0] = [
    { id, periodStart: "2025-01-01", repeat: "none" },
  ];
  const readAcknowledged = () =>
    db
      .prepare("SELECT acknowledged_at FROM goal_achievements WHERE goal_id=?")
      .bind(id)
      .first<string>("acknowledged_at");
  assert.deepEqual(await postAction(server, friend, "acknowledgeGoalAchievements", keys), {
    ok: true,
  });
  assert.equal(await readAcknowledged(), null);
  assert.deepEqual(await postAction(server, owner, "acknowledgeGoalAchievements", keys), {
    ok: true,
  });
  const acknowledged = await readAcknowledged();
  assert.ok(acknowledged);
  await db.prepare("UPDATE user SET is_private=1 WHERE id='refresh-owner'").run();
  assert.deepEqual(await friendGoals(), []);

  const entry = await db
    .prepare("SELECT id FROM journal_entries WHERE user_id='refresh-owner'")
    .first<number>("id");
  assert.deepEqual(await postAction(server, owner, "deleteJournalEntry", required(entry)), {
    ok: true,
  });
  await waitForCompletions(0);
  assert.deepEqual(await log(), { ok: true });
  await waitForCompletions(1);
  assert.equal(await readAcknowledged(), acknowledged);
}
