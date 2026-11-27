import assert from "node:assert/strict";

import type { SmokeContext } from "./harness.ts";

export async function testEntryParity({ server, db, signIn }: SmokeContext) {
  const fetch = (path: string, cookie?: string) =>
    server.fetch(path, { redirect: "manual", headers: cookie ? { cookie } : {} });
  for (const path of ["/about", "/account", "/search", "/api/health", "/does-not-exist"]) {
    const res = await fetch(path + "/?x=two%20words&x=again");
    assert.equal(res.status, 308, path);
    assert.equal(res.headers.get("location"), path + "?x=two%20words&x=again");
  }
  const home = await fetch("/");
  assert.equal(home.status, 200);
  const html = await home.text();
  assert.match(html, /<title>Betabook · Free climbing logbook and crag database<\/title>/);
  assert.match(
    html,
    /<meta name="description" content="Search routes and boulder problems, and log your sends and sessions for bouldering, sport and trad\.">/,
  );
  const pendingId = "entry-pending";
  const cookie = await signIn(pendingId);
  const memberHome = await fetch("/", cookie);
  assert.equal(memberHome.status, 307);
  assert.equal(memberHome.headers.get("location"), "/users/" + pendingId);
  assert.match(memberHome.headers.get("cache-control") ?? "", /private.*no-store/);
  for (const viewer of [undefined, cookie]) {
    const res = await fetch(
      "/?mode=climb&name=One%20Two&discipline=sport&utm_source=link&discipline=trad",
      viewer,
    );
    assert.equal(res.status, 308);
    assert.equal(
      res.headers.get("location"),
      "/search?mode=climb&name=One+Two&discipline=sport&discipline=trad&utm_source=link",
    );
  }
  await db
    .prepare("UPDATE user SET terms_version=NULL, terms_accepted_at=NULL WHERE id=?")
    .bind(pendingId)
    .run();
  const guestHome = await fetch("/", cookie);
  assert.equal(guestHome.status, 200);
  assert.match(await guestHome.text(), /id="public-entry"/);

  const owner = "entry-share-owner";
  await signIn(owner);
  await db.prepare("UPDATE user SET is_private=0 WHERE id=?").bind(owner).run();
  const token = await db
    .prepare("SELECT token FROM profile_share_links WHERE user_id=?")
    .bind(owner)
    .first("token");
  const api = "/api/pages/users/" + owner;
  const preview = await fetch(api + "?share=" + token, cookie);
  assert.equal(preview.status, 200);
  assert.match(preview.headers.get("cache-control") ?? "", /private.*no-store/);
  assert.deepEqual(await preview.json(), await (await fetch(api + "?share=" + token)).json());
  assert.equal((await fetch(api, cookie)).status, 428);
  assert.equal((await fetch(api + "?share=" + token + "&share=" + token, cookie)).status, 428);
  assert.equal((await fetch(api + "/journal?share=" + token, cookie)).status, 428);
  await db.prepare("DELETE FROM profile_share_links WHERE user_id=?").bind(owner).run();
  assert.equal((await fetch(api + "?share=" + token, cookie)).status, 401);
}
