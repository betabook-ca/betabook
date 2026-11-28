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

  assert.deepEqual(await postAction(server, friend, "markNotificationsRead", alert.updatedAt - 1), {
    ok: true,
  });
  assert.equal(await unreadCount(), 1, "an alert newer than the page stays unread");
  assert.deepEqual(await postAction(server, friend, "markNotificationsRead", alert.updatedAt), {
    ok: true,
  });
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

  // The public key is derived from the configured private key (RFC 8291 A).
  assert.equal(
    account.pushPublicKey,
    "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  );
  // Registered last, after every send above, so no test posts to a real push service.
  const keys = {
    p256dh:
      "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
    auth: "BTBZMqHH6r4Tts7J_aSIgg",
  };
  const endpoint = "https://fcm.googleapis.com/fcm/send/alerts-friend-device";
  const devices = () =>
    db
      .prepare("SELECT user_id FROM push_subscriptions WHERE endpoint=?")
      .bind(endpoint)
      .all<{ user_id: string }>()
      .then((r) => r.results.map((row) => row.user_id));
  for (const bad of [
    { endpoint: "https://169.254.169.254/latest", ...keys },
    { endpoint, p256dh: keys.auth, auth: keys.auth },
  ]) {
    assert.deepEqual(await postAction(server, friend, "savePushSubscription", bad), {
      ok: false,
      error: "This browser's notifications aren't supported.",
    });
  }
  assert.deepEqual(await devices(), []);
  assert.deepEqual(
    await postAction(server, friend, "savePushSubscription", { endpoint, ...keys }),
    { ok: true },
  );
  assert.deepEqual(await devices(), ["alerts-friend"]);
  assert.deepEqual(await postAction(server, climber, "deletePushSubscription", endpoint), {
    ok: true,
  });
  assert.deepEqual(await devices(), ["alerts-friend"], "only the owner can unsubscribe");
  assert.deepEqual(await postAction(server, friend, "deletePushSubscription", endpoint), {
    ok: true,
  });
  assert.deepEqual(await devices(), []);
}
