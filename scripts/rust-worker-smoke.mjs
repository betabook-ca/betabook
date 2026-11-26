import assert from "node:assert/strict";
import { test } from "node:test";

import { hashPassword } from "better-auth/crypto";
import { createTestHarness } from "wrangler";

import { testProfileAnalytics } from "./rust-smoke/analytics.mjs";
import { testGoalRefresh } from "./rust-smoke/goal-refresh.mjs";
import { testGoals } from "./rust-smoke/goals.mjs";
import { testImports } from "./rust-smoke/imports.mjs";
import { testLists } from "./rust-smoke/lists.mjs";
import { testModeration } from "./rust-smoke/moderation.mjs";
import { testPlatform } from "./rust-smoke/platform.mjs";
import { testProjects } from "./rust-smoke/projects.mjs";
import { testTrips } from "./rust-smoke/trips.mjs";

void test("Rust Worker HTTP flows", async (t) => {
  const server = createTestHarness({
    workers: [
      {
        configPath: "./crates/betabook-worker/wrangler.rust.jsonc",
        vars: { BETTER_AUTH_URL: "http://localhost" },
        secrets: {
          BETTER_AUTH_SECRET: "isolated-rust-worker-smoke-test-secret",
          TURNSTILE_SECRET_KEY: "",
        },
      },
    ],
  });
  t.after(() => server.close());
  await server.listen();
  const worker = server.getWorker();
  await worker.applyD1Migrations("DB");
  const { DB, CATALOG_EXPORTS } = await worker.getEnv();
  const status = await server.fetch("/api/terms/status");
  assert.equal(status.status, 200);
  const { version } = await status.json();
  const password = "smoke-test-password";
  const passwordHash = await hashPassword(password);
  async function signIn(id) {
    const email = id + "@example.test";
    await DB.prepare(
      "INSERT INTO user (id, name, email, email_verified, terms_version, terms_accepted_at, is_private) VALUES (?, ?, ?, 1, ?, 1, 1)",
    )
      .bind(id, id, email, version)
      .run();
    await DB.prepare(
      "INSERT INTO account (id, account_id, provider_id, user_id, password, updated_at) VALUES (?, ?, 'credential', ?, ?, 1)",
    )
      .bind(id, id, id, passwordHash)
      .run();
    const response = await server.fetch("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(response.status, 200, await response.text());
    const [cookie] = response.headers.getSetCookie();
    assert.ok(cookie);
    return cookie.split(";")[0];
  }
  await t.test("sign-in, private journal writes and R2 exports", async () => {
    const owner = await signIn("owner");
    const stranger = await signIn("stranger");
    const body = "Footwork drills";
    const write = await server.fetch("/api/actions/createJournalEntry", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: owner },
      body: JSON.stringify({
        args: [
          {
            __formData: [
              ["kind", "training"],
              ["entryDate", "2025-01-02"],
              ["body", body],
            ],
          },
        ],
      }),
    });
    assert.equal(write.status, 200);
    assert.deepEqual(await write.json(), { ok: true });
    const journal = "/api/users/owner/journal";
    const read = await server.fetch(journal, { headers: { cookie: owner } });
    assert.equal(read.status, 200);
    const { entries } = await read.json();
    assert.deepEqual(
      entries.map((entry) => entry.body),
      [body],
    );
    assert.equal((await server.fetch(journal, { headers: { cookie: stranger } })).status, 404);
    assert.equal((await server.fetch(journal)).status, 401);

    const catalog = '{"areas":[],"climbs":[]}';
    await CATALOG_EXPORTS.put("catalog/latest.json", catalog);
    const download = await server.fetch("/api/catalog/export", { headers: { cookie: owner } });
    assert.equal(download.status, 200);
    assert.equal(await download.text(), catalog);
  });
  await t.test("platform", () => testPlatform({ server, signIn }));
  await t.test("goals", () => testGoals({ server, db: DB, signIn }));
  await t.test("profile analytics", () => testProfileAnalytics({ server, db: DB, signIn }));
  await t.test("imports", () => testImports({ server, db: DB, signIn }));

  await t.test("moderation", () => testModeration({ server, db: DB, signIn }));
  await t.test("tutorial progress belongs to the signed-in member", async () => {
    assert.equal((await server.fetch("/api/pages/tutorial")).status, 401);
    const cookie = await signIn("tutorial-owner");
    const saved = await server.fetch("/api/actions/saveProductTourStatus", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ args: ["journal", 7, "completed"] }),
    });
    assert.deepEqual(await saved.json(), { ok: true });
    const result = await server.fetch("/api/pages/tutorial", { headers: { cookie } });
    assert.equal(result.status, 200);
    assert.match(result.headers.get("cache-control"), /private.*no-store/);
    assert.deepEqual((await result.json()).progress, [
      { tourId: "journal", version: 7, status: "completed" },
    ]);
    const other = await signIn("tutorial-other");
    assert.deepEqual(
      (await (await server.fetch("/api/pages/tutorial", { headers: { cookie: other } })).json())
        .progress,
      [],
    );
  });
  await t.test("climb lists", () => testLists({ server, db: DB, signIn }));
  await t.test("goal refresh", () => testGoalRefresh({ server, db: DB, signIn }));
  await t.test("projects", () => testProjects({ server, db: DB, signIn }));
  await t.test("trips", () => testTrips({ server, db: DB, signIn }));
});
