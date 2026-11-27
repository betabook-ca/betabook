import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { required } from "./harness.ts";
import type { SmokeContext } from "./harness.ts";
import { apiJson } from "./validate-api.ts";

// 8 × 8 RGB PNG. The production Images binding decodes and resizes it to WebP.
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAaUlEQVR42gXBgQAAAAgDwcEkE0wOzzCYZAZTd5Io0WKE" +
    "xYqIE1JRRRdTuNgixRVSU00307jZJs010lBDDzN42CHDDZIp02aMzZqYM9JSSy+zeNklyy1SqNBhgsOGhAvSUUcfc/jY" +
    "I8cdDy0IX8ELraphAAAAAElFTkSuQmCC",
  "base64",
);

export async function testProfilePhotos({
  server,
  db,
  bucket,
  images,
  signIn,
}: SmokeContext & { bucket: R2Bucket; images: ImagesBinding }) {
  const ids = ["avatar-owner", "another-avatar-owner"];
  const cookies = [];
  const keys = [];
  const storedPath = (id: string) =>
    db.prepare("SELECT image FROM user WHERE id=?").bind(id).first<string>("image");
  async function upload(cookie: string, bytes: Uint8Array<ArrayBuffer>) {
    const form = new FormData();
    form.append("photo", new Blob([bytes], { type: "image/png" }), "avatar.png");
    // Serialize with the same boundary in the header and body when crossing
    // from the Node fetch implementation into the Wrangler harness.
    const multipart = new Response(form);
    const response = await server.fetch("/api/actions/uploadProfilePhoto", {
      method: "POST",
      headers: { cookie, "content-type": required(multipart.headers.get("content-type")) },
      body: await multipart.arrayBuffer(),
    });
    assert.equal(response.status, 200);
    return apiJson(response, "/api/actions/uploadProfilePhoto");
  }

  for (const id of ids) {
    const cookie = await signIn(id);
    cookies.push(cookie);
    assert.deepEqual(await upload(cookie, png), { ok: true });
    const path = required(await storedPath(id));
    const response = await server.fetch(path);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/webp");
    assert.match(response.headers.get("cache-control") ?? "", /public.*immutable/);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
    const info = await images.info(required(new Response(bytes).body));
    assert.ok("width" in info);
    const { width, height } = info;
    assert.deepEqual([width, height], [256, 256]);
    const key = path.slice("/api/avatars/".length);
    assert.ok(key.startsWith(id + "/"));
    assert.match(key.slice(id.length + 1), /^[a-f0-9]{32}\.webp$/);
    keys.push(key);
    const etag = response.headers.get("etag");
    assert.equal(etag, '"' + key.slice(id.length + 1, -5) + '"');
    const unchanged = await server.fetch(path, { headers: { "if-none-match": etag } });
    assert.equal(unchanged.status, 304);
    assert.equal(await unchanged.text(), "");
    assert.deepEqual(Buffer.from(await required(await bucket.get(key)).arrayBuffer()), bytes);
  }
  // A current legacy content-addressed photo remains readable and reusable.
  const previous = await bucket.get(keys[1]);
  const legacyBody = Buffer.from(await required(previous).arrayBuffer());
  const legacyKey =
    ids[1] + "/" + createHash("sha256").update(legacyBody).digest("hex").slice(0, 32) + ".webp";
  await bucket.put(legacyKey, legacyBody);
  await db
    .prepare("UPDATE user SET image=? WHERE id=?")
    .bind("/api/avatars/" + legacyKey, ids[1])
    .run();
  assert.deepEqual(await upload(cookies[1], png), { ok: true });
  assert.equal(await storedPath(ids[1]), "/api/avatars/" + legacyKey);
  assert.equal((await server.fetch("/api/avatars/" + legacyKey)).status, 200);

  // A failed replacement preserves the previous avatar.
  assert.equal((await upload(cookies[0], Buffer.from("wrong image"))).ok, false);
  assert.equal(await storedPath(ids[0]), "/api/avatars/" + keys[0]);
  const removed = await server.fetch("/api/actions/removeProfilePhoto", {
    method: "POST",
    headers: { cookie: cookies[0], "content-type": "application/json" },
    body: JSON.stringify({ args: [] }),
  });
  assert.deepEqual(await removed.json(), { ok: true });
  assert.equal(await storedPath(ids[0]), null);
  assert.equal(await bucket.head(keys[0]), null);
  assert.ok(await bucket.head(legacyKey));

  // Start two restores with no current avatar. A slow cleanup of the old
  // generation must never delete the winner, even though all bytes match.
  const results = await Promise.all([upload(cookies[0], png), upload(cookies[0], png)]);
  assert.deepEqual(results, [{ ok: true }, { ok: true }]);
  const restored = required(await storedPath(ids[0])).slice("/api/avatars/".length);
  assert.notEqual(restored, keys[0]);
  const listed = await bucket.list({ prefix: ids[0] + "/" });
  assert.deepEqual(
    listed.objects.map((o) => o.key),
    [restored],
  );
  assert.ok(await bucket.head(restored));
  assert.deepEqual(await upload(cookies[0], png), { ok: true });
  assert.equal(await storedPath(ids[0]), "/api/avatars/" + restored);
}
