import assert from "node:assert/strict";

export async function testUpstreamImports({ server, db, signIn }) {
  const owner = "upstreams-owner";
  const cookie = await signIn(owner);
  const get = (path) => server.fetch(path, { headers: { cookie } });
  const kaya = async (username) => {
    const res = await get("/api/import/kaya?climbTypeId=1&username=" + username);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("cache-control"), /private.*no-store.*no-transform/);
    assert.match(res.headers.get("content-type"), /application\/x-ndjson/);
    return (await res.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
  };
  assert.deepEqual(await kaya("fixture"), [
    { type: "heartbeat" },
    { type: "profile", username: "fixture" },
    {
      type: "page",
      items: [{ id: "41", date: "2026-01-02", climb: { name: "Fixture climb" } }],
      total: 1,
    },
    { type: "complete", total: 1 },
  ]);
  for (const [name, message] of [
    ["private", /public profile/],
    ["mismatched", /complete KAYA history/],
  ]) {
    const events = await kaya(name);
    assert.equal(events.at(-1).type, "error");
    assert.match(events.at(-1).error, message);
    assert.ok(!events.some((e) => e.type === "complete" || e.type === "page"));
  }
  const ticks = await get("/api/import/mountain-project?userId=123456789");
  assert.equal(ticks.status, 200);
  assert.match(ticks.headers.get("content-type"), /^text\/csv/);
  assert.equal(ticks.headers.get("x-mountain-project-user"), "fixture-climber");
  assert.equal(await ticks.text(), "Date,Route\n2026-01-02,Fixture climb\n");
  const unavailable = await get("/api/import/mountain-project?userId=123456788");
  assert.equal(unavailable.status, 403);
  assert.match((await unavailable.json()).error, /would not share/);

  const trip = await db
    .prepare(
      "INSERT INTO trips(user_id,name,start_date,end_date,album_url) VALUES (?,'Trip','2026-01-01','2026-01-02','https://photos.app.goo.gl/FixtureAlbum') RETURNING id",
    )
    .bind(owner)
    .first();
  const photos = [
    {
      url: "https://lh3.googleusercontent.com/pw/abcdefghijklmnopqrst",
      width: 800,
      height: 600,
      video: { duration: 4 },
    },
  ];
  const path = "/api/pages/users/" + owner + "/trips/" + trip.id + "/photos";
  assert.deepEqual(await (await get(path)).json(), photos);
  // The upstream serves its fixture only once. The second request hits workerd's Cache.
  assert.deepEqual(await (await get(path)).json(), photos);
}
