import assert from "node:assert/strict";

import type { SmokeContext } from "./harness.ts";
import { apiJson, postAction } from "./validate-api.ts";

export async function testTrips({ server, db, signIn }: SmokeContext) {
  const owner = await signIn("trip-owner");
  const friend = await signIn("trip-friend");
  const stranger = await signIn("trip-stranger");
  await db
    .prepare(
      "UPDATE user SET is_private=0, trip_visibility='friends', journal_visibility='friends' WHERE id='trip-owner'",
    )
    .run();
  await db
    .prepare(
      "INSERT INTO friendships(user_id,friend_id,requested_by,status) VALUES ('trip-friend','trip-owner','trip-owner','accepted')",
    )
    .run();

  async function read<P extends import("@/spa/lib/api").GetPath>(
    template: P,
    path: string,
    cookie?: string,
  ) {
    const reply = await server.fetch(path, cookie ? { headers: { cookie } } : {});
    assert.equal(reply.status, 200, await reply.clone().text());
    return apiJson(reply, template);
  }
  const input = {
    name: "Winter trip fixture",
    startDate: "2025-01-01",
    endDate: "2025-01-03",
    companions: ["trip-friend"],
  };
  const created = await postAction(server, owner, "saveTrip", null, input);
  assert.equal(created.ok, true, JSON.stringify(created));
  const id = created.value;
  const member = "/api/pages/users/trip-owner/trips/" + id;
  assert.equal(
    (await read("/api/pages/users/{id}/trips/{trip}", member, owner)).header.isOwner,
    true,
  );
  const memberAnalytics = await read(
    "/api/pages/users/{id}/trips/{trip}/analytics",
    member + "/analytics",
    owner,
  );
  assert.deepEqual(memberAnalytics.view.analytics, { sends: [], sessions: [] });
  assert.equal(
    (await read("/api/pages/users/{id}/trips/{trip}", member, friend)).trip.companions[0].id,
    "trip-friend",
  );
  assert.equal((await server.fetch(member, { headers: { cookie: stranger } })).status, 404);
  assert.equal((await postAction(server, stranger, "saveTripNotes", id, "unauthorized")).ok, false);
  assert.deepEqual(
    await postAction(server, owner, "saveTripNotes", id, "Trip **notes** sentinel"),
    {
      ok: true,
    },
  );
  const journal = (entryDate: string, body: string) =>
    postAction(server, owner, "createJournalEntry", {
      __formData: [
        ["kind", "training"],
        ["entryDate", entryDate],
        ["body", body],
      ],
    });
  assert.deepEqual(await journal("2025-01-02", "trip day"), { ok: true });
  assert.deepEqual(await journal("2025-02-02", "outside window"), { ok: true });
  const area = await db
    .prepare("INSERT INTO areas(name) VALUES('Trip fixture area') RETURNING id")
    .first<{ id: number }>();
  assert.ok(area);
  const climb = await db
    .prepare(
      "INSERT INTO climbs(area_id,name,type,grade) VALUES(?,'Trip fixture climb','boulder',10) RETURNING id",
    )
    .bind(area.id)
    .first<{ id: number }>();
  assert.ok(climb);
  await db
    .prepare(
      "INSERT INTO sends(user_id,climb_id,ascent_style,date_sent,suggested_grade,comment) VALUES('trip-owner',?,'redpoint','2025-01-03',10,'Inside trip window')",
    )
    .bind(climb.id)
    .run();
  const invalid = await postAction(server, owner, "saveTrip", null, {
    ...input,
    name: "Must roll back",
    companions: ["trip-stranger"],
  });
  assert.equal(invalid.ok, false);
  assert.deepEqual(
    (
      await read("/api/pages/users/{id}/trips", "/api/pages/users/trip-owner/trips", owner)
    ).trips.map((trip) => trip.name),
    [input.name],
  );
  for (const suffix of ["", "/analytics"]) {
    const path = "/users/trip-owner/trips/" + id + suffix;
    const html = await server.fetch(path, { headers: { cookie: friend } });
    assert.equal(html.status, 200);
    assert.match(await html.text(), /Winter trip fixture/);
    assert.equal((await server.fetch(path, { headers: { cookie: stranger } })).status, 404);
  }
  const share = await postAction(server, owner, "shareTrip", id, "7d");
  assert.equal(share.ok, true, JSON.stringify(share));
  const token = share.value.token;
  const api = "/api/pages/trips/" + token;
  const sharedTrip = async (cookie?: string) => {
    const page = await read("/api/pages/trips/{token}", api, cookie);
    assert.ok("view" in page);
    return page;
  };
  const sharedAnalytics = async () => {
    const page = await read("/api/pages/trips/{token}/analytics", api + "/analytics");
    assert.ok("view" in page);
    return page.view.analytics;
  };
  const shared = await sharedTrip();
  assert.deepEqual(await read("/api/pages/trips/{token}/photos", api + "/photos"), []);
  assert.deepEqual(
    await read("/api/pages/users/{id}/trips/{trip}/photos", member + "/photos", friend),
    [],
  );
  assert.equal(
    (await server.fetch(member + "/photos", { headers: { cookie: stranger } })).status,
    404,
  );
  assert.equal(shared.notes, "Trip **notes** sentinel");
  assert.ok(!("id" in shared.trip));
  assert.deepEqual(shared.trip.companions, []);
  assert.deepEqual(
    shared.view.rows.entries.map((row) => row.body),
    ["trip day"],
  );
  assert.doesNotMatch(JSON.stringify(shared), /trip-friend/);
  const analytics = await sharedAnalytics();
  assert.deepEqual(
    analytics.sends.map((send) => send.climbId),
    [climb.id],
  );
  assert.deepEqual(analytics.sessions, []);
  assert.equal(shared.view.rows.sends[0].comment, "Inside trip window");
  const preview = await server.fetch("/trips/" + token);
  assert.equal(preview.status, 200);
  assert.match(await preview.text(), /Winter trip fixture/);
  assert.deepEqual(await read("/api/pages/trips/{token}", api, owner), {
    redirectTo: "/users/trip-owner/trips/" + id,
  });
  const { version } = await read("/api/terms/status", "/api/terms/status");
  await db
    .prepare("UPDATE user SET terms_version=NULL,terms_accepted_at=NULL WHERE id='trip-owner'")
    .run();
  assert.equal((await sharedTrip(owner)).trip.name, input.name);
  assert.equal(
    (await server.fetch("/trips/" + token, { headers: { cookie: owner }, redirect: "manual" }))
      .status,
    200,
  );
  await db
    .prepare("UPDATE user SET terms_version=?,terms_accepted_at=1 WHERE id='trip-owner'")
    .bind(version)
    .run();
  const extended = await postAction(server, owner, "shareTrip", id, "30d");
  assert.ok(extended.ok);
  assert.equal(extended.value.token, token);
  assert.equal((await postAction(server, friend, "removeMyTripTag", id)).ok, true);
  assert.equal(
    (await read("/api/pages/users/{id}/trips/{trip}", member, owner)).trip.companions.length,
    0,
  );
  const edit = await postAction(server, owner, "saveTrip", id, {
    ...input,
    companions: undefined,
    endDate: "2025-01-02",
  });
  assert.equal(edit.ok, true);
  assert.equal((await sharedAnalytics()).sends.length, 0);
  assert.equal((await sharedTrip()).view.rows.sends.length, 0);
  await db
    .prepare("UPDATE trip_share_links SET expires_at=datetime('now','-1 day') WHERE token=?")
    .bind(token)
    .run();
  assert.deepEqual(await read("/api/pages/trips/{token}", api), { expired: true });
  assert.equal((await server.fetch(api + "/photos")).status, 404);
  const renewed = await postAction(server, owner, "shareTrip", id, "never");
  assert.ok(renewed.ok);
  assert.notEqual(renewed.value.token, token);
  assert.equal((await server.fetch(api)).status, 404);
  const fresh = "/api/pages/trips/" + renewed.value.token;
  assert.equal((await postAction(server, owner, "unshareTrip", id)).ok, true);
  assert.equal((await server.fetch(fresh)).status, 404);
  const last = await postAction(server, owner, "shareTrip", id, "never");
  assert.ok(last.ok);
  await db.prepare("UPDATE user SET is_private=1 WHERE id='trip-owner'").run();
  assert.equal((await server.fetch("/api/pages/trips/" + last.value.token)).status, 404);
  assert.equal((await postAction(server, owner, "deleteTrip", id)).ok, true);
  assert.equal((await server.fetch(member, { headers: { cookie: owner } })).status, 404);
}
