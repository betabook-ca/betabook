import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

import { required } from "./harness.ts";
import type { SmokeContext } from "./harness.ts";
import { apiJson, postAction } from "./validate-api.ts";

const isoDay = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

export async function testSendAlerts({ server, db, signIn }: SmokeContext) {
  const climber = await signIn("alerts-climber");
  const friend = await signIn("alerts-friend");
  await db.prepare("UPDATE user SET is_private=0 WHERE id='alerts-climber'").run();
  await db
    .prepare(
      "INSERT INTO friendships(user_id,friend_id,status,requested_by) VALUES('alerts-climber','alerts-friend','accepted','alerts-friend')",
    )
    .run();
  const area = required(
    await db
      .prepare("INSERT INTO areas(name) VALUES ('Alerts crag') RETURNING id")
      .first<number>("id"),
  );
  const climb = async (name: string) =>
    required(
      await db
        .prepare("INSERT INTO climbs(area_id,name,type,grade) VALUES(?,?,'boulder',4) RETURNING id")
        .bind(area, name)
        .first<number>("id"),
    );
  const today = isoDay(0);
  const send = (climbId: number, entryDate: string) =>
    postAction(server, climber, "createJournalEntry", {
      __formData: [
        ["kind", "session"],
        ["climbId", String(climbId)],
        ["sent", "on"],
        ["suggestedGrade", "4"],
        ["ascentStyle", "redpoint"],
        ["entryDate", entryDate],
      ],
    });

  async function waitForUnread() {
    const deadline = Date.now() + 10_000;
    let unread;
    do {
      unread = await db
        .prepare(
          "SELECT count(*) AS n FROM send_alerts WHERE recipient_id='alerts-friend' AND read_at IS NULL",
        )
        .first<number>("n");
      if (unread === 1) return;
      await delay(50);
    } while (Date.now() < deadline);
    assert.equal(unread, 1, "a new send should alert the friend");
  }
  const notifications = async (cookie: string) => {
    const response = await server.fetch("/api/notifications", { headers: { cookie } });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control") ?? "", /private, no-store/);
    const page = await apiJson(response, "/api/notifications");
    assert.ok("alerts" in page);
    return page.alerts;
  };
  const unreadCount = async () => {
    const response = await server.fetch("/api/notifications?view=count", {
      headers: { cookie: friend },
    });
    const body = await apiJson(response, "/api/notifications");
    assert.ok("count" in body);
    return body.count;
  };

  assert.deepEqual(await send(await climb("Old problem"), isoDay(-30)), { ok: true });
  assert.deepEqual(await send(await climb("Fresh problem"), today), { ok: true });
  await waitForUnread();
  const [alert, ...rest] = await notifications(friend);
  assert.deepEqual(rest, []);
  assert.equal(alert?.userId, "alerts-climber");
  assert.equal(alert.date, today);
  assert.equal(alert.sends, 1);
  assert.equal(alert.unread, true);
  assert.deepEqual(
    alert.climbs.map((c) => c.name),
    ["Fresh problem"],
  );
  assert.deepEqual(await notifications(climber), []);
  assert.equal(await unreadCount(), 1);

  assert.deepEqual(await postAction(server, friend, "markNotificationsRead"), { ok: true });
  assert.equal(await unreadCount(), 0);

  assert.deepEqual(
    await postAction(server, friend, "setSendAlertPreferences", {
      shareWithFriends: true,
      receive: false,
    }),
    { ok: true },
  );
  assert.deepEqual(await notifications(friend), []);
  const account = await apiJson(
    await server.fetch("/api/pages/account", { headers: { cookie: friend } }),
    "/api/pages/account",
  );
  assert.deepEqual(account.sendAlerts, { shareWithFriends: true, receive: false });
  assert.equal(
    (
      await postAction(server, friend, "setSendAlertPreferences", {
        shareWithFriends: true,
      } as never)
    ).ok,
    false,
  );
}
