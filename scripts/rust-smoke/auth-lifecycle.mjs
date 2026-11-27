import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

export async function testAuthLifecycle({ server, db, signIn, origin, secret }) {
  const owner = "auth-lifecycle";
  const cookie = await signIn(owner);
  await db
    .prepare("UPDATE session SET created_at=?,updated_at=?,expires_at=? WHERE user_id=?")
    .bind(Date.now() - 2 * 86400000, Date.now() - 2 * 86400000, Date.now() + 10 * 86400000, owner)
    .run();
  const session = await server.fetch("/api/auth/get-session", { headers: { cookie } });
  assert.equal(session.status, 200);
  assert.match(session.headers.get("set-cookie"), /Max-Age=2592000/);
  assert.equal((await session.json()).user.id, owner);
  const post = (path, body, headers = {}) =>
    server.fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", origin, ...headers },
      body: JSON.stringify(body),
    });
  const stale = await post("/api/auth/delete-user", {}, { cookie });
  assert.equal((await stale.json()).code, "SESSION_EXPIRED");
  const duplicate = await post("/api/auth/sign-up/email", {
    email: owner + "@example.test",
    name: "Second name",
    password: "other-password",
    acceptedTermsVersion: (await (await server.fetch("/api/terms/status")).json()).version,
  });
  assert.equal(duplicate.status, 200);
  assert.notEqual((await duplicate.json()).user.id, owner);
  assert.equal(
    (
      await db
        .prepare("SELECT count(*) AS n FROM user WHERE email=?")
        .bind(owner + "@example.test")
        .first()
    ).n,
    1,
  );
  // The outgoing runtime's verification emails bind their HS256 token to both account and email.
  await db.prepare("UPDATE user SET email_verified=0 WHERE id=?").bind(owner).run();
  const encode = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const unsigned =
    encode({ alg: "HS256" }) +
    "." +
    encode({
      email: owner + "@example.test",
      userId: owner,
      exp: Math.floor(Date.now() / 1000) + 300,
    });
  const token = unsigned + "." + createHmac("sha256", secret).update(unsigned).digest("base64url");
  const verify = await server.fetch(
    "/api/auth/verify-email?token=" + token + "&callbackURL=%2Fsign-in",
    { redirect: "manual" },
  );
  assert.equal(verify.status, 302);
  assert.equal(
    (await db.prepare("SELECT email_verified AS ok FROM user WHERE id=?").bind(owner).first()).ok,
    1,
  );
  await db
    .prepare(
      "INSERT INTO verification (id,identifier,value,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,?)",
    )
    .bind(
      "old-reset",
      "reset-password:single-use-reset",
      owner,
      Date.now() + 3600000,
      Date.now(),
      Date.now(),
    )
    .run();
  const oldLink = await server.fetch(
    "/api/auth/reset-password/single-use-reset?callbackURL=%2Freset-password",
    { redirect: "manual" },
  );
  assert.equal(oldLink.status, 302);
  assert.equal(
    new URL(oldLink.headers.get("location"), origin).searchParams.get("token"),
    "single-use-reset",
  );
  const reset = await post("/api/auth/reset-password", {
    token: "single-use-reset",
    newPassword: "new-passphrase",
  });
  assert.equal(reset.status, 200);
  assert.equal(
    await (await server.fetch("/api/auth/get-session", { headers: { cookie } })).json(),
    null,
  );
  const again = await post("/api/auth/reset-password", {
    token: "single-use-reset",
    newPassword: "newer-passphrase",
  });
  assert.equal(again.status, 400);
  const updated = await post("/api/auth/sign-in/email", {
    email: owner + "@example.test",
    password: "new-passphrase",
  });
  assert.equal(updated.status, 200);
  const newCookie = updated.headers.getSetCookie()[0].split(";")[0];
  const signOut = await post("/api/auth/sign-out", {}, { cookie: newCookie });
  assert.equal(signOut.status, 200);
  assert.equal(
    await (await server.fetch("/api/auth/get-session", { headers: { cookie: newCookie } })).json(),
    null,
  );
}

export async function testCatalogCron({ worker, bucket }) {
  const result = await worker.scheduled({ cron: "0 6 * * 1" });
  assert.equal(result.outcome, "ok");
  const object = await bucket.get("catalog/latest.json");
  const catalog = await object.json();
  assert.ok(Array.isArray(catalog.areas));
  assert.ok(Array.isArray(catalog.climbs));
}
