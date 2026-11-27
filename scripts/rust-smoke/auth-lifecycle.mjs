import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { fileURLToPath } from "node:url";

import { createTestHarness, experimental_readRawConfig } from "wrangler";

function assertClearedSessionCookies(response) {
  const cleared = response.headers
    .getSetCookie()
    .filter((line) => /^(?:__Secure-)?better-auth\.session_token=/.test(line));
  assert.equal(cleared.length, 2);
  assert.deepEqual(cleared.map((line) => line.split("=")[0]).sort(), [
    "__Secure-better-auth.session_token",
    "better-auth.session_token",
  ]);
  for (const line of cleared) {
    assert.match(line, /^[^=]+=;/);
    assert.match(line, /; Max-Age=0(?:;|$)/);
    assert.match(line, /; Path=\/(?:;|$)/);
    if (line.startsWith("__Secure-")) assert.match(line, /; Secure(?:;|$)/);
  }
}

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
  const next = "/users/a/journal?view=training&tag=one";
  const callback = "/sign-in?next=" + encodeURIComponent(next) + "&error=previous#form";
  const started = await post("/api/auth/sign-in/social", {
    provider: "google",
    errorCallbackURL: callback,
  });
  assert.equal(started.status, 200);
  const state = new URL((await started.json()).url).searchParams.get("state");
  const [oauthCookie] = started.headers.getSetCookie();
  const cancelled = await server.fetch(
    "/api/auth/callback/google?error=access_denied&state=" + state,
    {
      headers: { cookie: oauthCookie.split(";")[0] },
      redirect: "manual",
    },
  );
  assert.equal(cancelled.status, 302);
  const location = new URL(cancelled.headers.get("location"), origin);
  assert.equal(location.pathname, "/sign-in");
  assert.equal(location.searchParams.get("next"), next);
  assert.deepEqual(location.searchParams.getAll("error"), ["access_denied"]);
  assert.equal(location.hash, "#form");
  const stale = await post("/api/auth/delete-user", {}, { cookie });
  assert.equal((await stale.json()).code, "SESSION_EXPIRED");
  const { version } = await (await server.fetch("/api/terms/status")).json();
  const invalidEmail = await post("/api/auth/sign-up/email", {
    name: "Invalid address fixture",
    email: "missing-domain@",
    password: "fixture-password",
    acceptedTermsVersion: version,
  });
  assert.equal(invalidEmail.status, 400);
  const invalidPassword = await post("/api/auth/sign-in/email", {
    email: owner + "@example.test",
    password: "x".repeat(129),
  });
  assert.equal(invalidPassword.status, 400);
  assert.equal((await invalidPassword.json()).code, "PASSWORD_TOO_LONG");
  const duplicate = await post("/api/auth/sign-up/email", {
    email: owner + "@example.test",
    name: "Second name",
    password: "other-password",
    acceptedTermsVersion: version,
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
  const signedVerification = (exp) => {
    const unsigned =
      encode({ alg: "HS256" }) +
      "." +
      encode({ email: owner + "@example.test", userId: owner, exp });
    return unsigned + "." + createHmac("sha256", secret).update(unsigned).digest("base64url");
  };
  const now = Date.now();
  await db
    .prepare(
      "INSERT INTO verification(id,identifier,value,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,?)",
    )
    .bind(
      "expired-mail",
      "email-verification:expired-mail-token",
      owner,
      now - 1,
      now - 10000,
      now - 10000,
    )
    .run();
  for (const [token, error] of [
    ["expired-mail-token", "TOKEN_EXPIRED"],
    [signedVerification(Math.floor(now / 1000) - 1), "TOKEN_EXPIRED"],
    ["unknown-token", "INVALID_TOKEN"],
    ["", "INVALID_TOKEN"],
  ]) {
    const query = new URLSearchParams({ token, callbackURL: callback });
    const response = await server.fetch("/api/auth/verify-email?" + query, { redirect: "manual" });
    assert.equal(response.status, 302);
    const returnUrl = new URL(response.headers.get("location"), origin);
    assert.equal(returnUrl.pathname, "/sign-in");
    assert.equal(returnUrl.searchParams.get("next"), next);
    assert.deepEqual(returnUrl.searchParams.getAll("error"), [error]);
    assert.equal(returnUrl.hash, "#form");
  }
  assert.equal(
    (await db.prepare("SELECT email_verified FROM user WHERE id=?").bind(owner).first())
      .email_verified,
    0,
  );
  const token = signedVerification(Math.floor(now / 1000) + 300);
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
  assertClearedSessionCookies(signOut);
  assert.equal(
    await (await server.fetch("/api/auth/get-session", { headers: { cookie: newCookie } })).json(),
    null,
  );

  const deletionOwner = "session-clear-fixture";
  const deletionCookie = await signIn(deletionOwner);
  // A live session near expiry requests renewal during authentication. Deletion
  // must clear it even in that case.
  await db
    .prepare("UPDATE session SET expires_at=? WHERE user_id=?")
    .bind(Date.now() + 3_600_000, deletionOwner)
    .run();
  const deleted = await post("/api/auth/delete-user", {}, { cookie: deletionCookie });
  assert.equal(deleted.status, 200);
  assertClearedSessionCookies(deleted);
  assert.equal(
    await (
      await server.fetch("/api/auth/get-session", { headers: { cookie: deletionCookie } })
    ).json(),
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

export async function testFailedCatalogCompletion() {
  const { rawConfig } = experimental_readRawConfig({ config: "./wrangler.jsonc" });
  const main = fileURLToPath(new URL("./fixtures/fail-export-worker.mjs", import.meta.url));
  const harness = createTestHarness({ workers: [{ config: { ...rawConfig, build: {}, main } }] });
  try {
    await harness.listen();
    const worker = harness.getWorker();
    await worker.applyD1Migrations("DB");
    const { CATALOG_EXPORTS: bucket } = await worker.getEnv();
    await bucket.put("catalog/latest.json", "previous snapshot");
    const outcome = await worker.scheduled({ cron: "0 6 * * 1" }).then(
      (r) => r.outcome,
      () => "exception",
    );
    assert.notEqual(outcome, "ok");
    const marker = await bucket.get("fixture-upload-id");
    assert.ok(marker, "the finalization call was reached");
    const pending = bucket.resumeMultipartUpload("catalog/latest.json", await marker.text());
    await assert.rejects(
      () => pending.uploadPart(1, "probe"),
      /upload.*(not exist|not found)|NoSuchUpload/i,
    );
    assert.equal(await (await bucket.get("catalog/latest.json")).text(), "previous snapshot");
  } finally {
    await harness.close();
  }
}
