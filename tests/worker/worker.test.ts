import assert from "node:assert/strict";
import { test } from "node:test";

import { createTestHarness } from "wrangler";

// oxlint-disable-next-line import/no-relative-parent-imports -- Node runs the same seed password helper used by local setup.
import { hashSeedPassword } from "../../scripts/seed-password.ts";
import { testProfileAnalytics } from "./analytics.ts";
import {
  testAuthLifecycle,
  testCatalogCron,
  testFailedCatalogCompletion,
} from "./auth-lifecycle.ts";
import { testProfilePhotos } from "./avatars.ts";
import { testCatalogHtml } from "./catalog-html.ts";
import { testGoalRefresh } from "./goal-refresh.ts";
import { testGoals } from "./goals.ts";
import { testImports } from "./imports.ts";
import { testLists } from "./lists.ts";
import { testModeration } from "./moderation.ts";
import { testPlatform } from "./platform.ts";
import { testProjects } from "./projects.ts";
import { testPublicSearch } from "./public-search.ts";
import { testSendAlerts } from "./send-alerts.ts";
import { testCatalogEdits, testMigrationObjects } from "./storage-invariants.ts";
import { testTrips } from "./trips.ts";
import { testUpstreamImports } from "./upstreams.ts";
import { apiJson, checkedTransport } from "./validate-api.ts";

void test("Rust Worker HTTP flows", async (t) => {
  const authSecret = "isolated-rust-worker-smoke-test-secret";
  const harness = createTestHarness({
    workers: [
      {
        configPath: "./wrangler.jsonc",
        vars: { BETTER_AUTH_URL: "http://localhost" },
        secrets: {
          BETTER_AUTH_SECRET: authSecret,
          TURNSTILE_SECRET_KEY: "",
          CLOUDFLARE_USAGE_ACCOUNT_ID: "",
          CLOUDFLARE_USAGE_API_TOKEN: "",
          RESEND_API_KEY: "",
          GOOGLE_CLIENT_ID: "fixture-google-id",
          GOOGLE_CLIENT_SECRET: "fixture-google-secret",
        },
      },
      {
        configPath: "./tests/worker/fixtures/wrangler.jsonc",
        vars: { BETTER_AUTH_URL: "http://localhost" },
        secrets: { BETTER_AUTH_SECRET: authSecret },
      },
    ],
  });
  t.after(() => harness.close());
  const server = { fetch: await checkedTransport(harness.fetch.bind(harness)) };
  const { url } = await harness.listen();
  const worker = harness.getWorker<CloudflareEnv>();
  // workerd must see a failed scheduled invocation when D1 is unavailable.
  const failedCron = await worker.scheduled({ cron: "0 6 * * 1" }).then(
    (r) => r.outcome,
    () => "exception",
  );
  assert.notEqual(failedCron, "ok");
  await worker.applyD1Migrations("DB");
  const { DB, CATALOG_EXPORTS, PROFILE_PHOTOS, IMAGES } = await worker.getEnv();
  const status = await server.fetch("/api/terms/status");
  assert.equal(status.status, 200);
  const { version } = await apiJson(status, "/api/terms/status");
  const password = "smoke-test-password";
  const passwordHash = await hashSeedPassword(password);
  async function signIn(id: string, db = DB, transport = server, origin = url.origin) {
    const email = id + "@example.test";
    await db
      .prepare(
        "INSERT INTO user (id, name, email, email_verified, terms_version, terms_accepted_at, is_private) VALUES (?, ?, ?, 1, ?, 1, 1)",
      )
      .bind(id, id, email, version)
      .run();
    await db
      .prepare(
        "INSERT INTO account (id, account_id, provider_id, user_id, password, updated_at) VALUES (?, ?, 'credential', ?, ?, 1)",
      )
      .bind(id, id, id, passwordHash)
      .run();
    const response = await transport.fetch("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(response.status, 200, await response.text());
    const [cookie] = response.headers.getSetCookie();
    assert.ok(cookie);
    return cookie.split(";")[0];
  }
  await t.test("indexes and triggers survive the complete D1 migration chain", () =>
    testMigrationObjects(DB),
  );
  await t.test("avatar uploads, reads and removal", () =>
    testProfilePhotos({ server, db: DB, bucket: PROFILE_PHOTOS, images: IMAGES, signIn }),
  );
  await t.test("catalog edits preserve search, ratings and public send privacy", () =>
    testCatalogEdits({ server, db: DB, signIn }),
  );
  await t.test("auth lifecycle across cutover", () =>
    testAuthLifecycle({
      server,
      db: DB,
      signIn,
      origin: url.origin,
      secret: authSecret,
    }),
  );
  await t.test(
    "failed catalog completion aborts the pending R2 parts",
    testFailedCatalogCompletion,
  );
  await t.test("successful catalog cron", () =>
    testCatalogCron({ worker, bucket: CATALOG_EXPORTS }),
  );
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
    const { entries } = await apiJson(read, "/api/users/{id}/journal");
    assert.deepEqual(
      entries.map((entry) => entry.body),
      [body],
    );
    assert.equal((await server.fetch(journal, { headers: { cookie: stranger } })).status, 404);
    assert.equal((await server.fetch(journal)).status, 401);

    const object = await CATALOG_EXPORTS.get("catalog/latest.json");
    assert.ok(object);
    const catalog = await object.text();
    const download = await server.fetch("/api/catalog/export", { headers: { cookie: owner } });
    assert.equal(download.status, 200);
    assert.equal(await download.text(), catalog);
  });
  await t.test("catalog HTML", () => testCatalogHtml({ server, db: DB, signIn }));
  await t.test("platform", () => testPlatform({ server, signIn, db: DB }));
  await t.test("shared profile metadata and data require one current token", async () => {
    const id = "profile-preview";
    await signIn(id);
    await DB.prepare("UPDATE user SET is_private=0 WHERE id=?").bind(id).run();
    const token = await DB.prepare("SELECT token FROM profile_share_links WHERE user_id=?")
      .bind(id)
      .first<string>("token");
    assert.ok(token);
    const url = "/users/" + id + "?share=" + token;
    const meta = await (await server.fetch(url)).text();
    assert.match(meta, /<title>profile-preview on Betabook<\/title>/);
    assert.match(meta, /<meta property="og:type" content="profile">/);
    assert.match(meta, /profile-preview invited you to Betabook/);
    assert.equal(
      (await apiJson(server.fetch("/api/pages" + url), "/api/pages/users/{id}")).mode,
      "shared",
    );
    const ambiguous = url + "&share=" + token;
    assert.equal((await server.fetch("/api/pages" + ambiguous)).status, 401);
    assert.doesNotMatch(
      await (await server.fetch(ambiguous)).text(),
      /profile-preview invited you/,
    );
  });
  await t.test("goals", () => testGoals({ server, db: DB, signIn }));
  await t.test("profile analytics", () => testProfileAnalytics({ server, db: DB, signIn }));
  await t.test("imports", () => testImports({ server, db: DB, signIn }));
  await t.test("upstream imports and album previews", async () => {
    const fixture = harness.getWorker<Pick<CloudflareEnv, "DB">>("provider-fixture");
    const fetch = await checkedTransport(fixture.fetch.bind(fixture));
    await fixture.applyD1Migrations("DB");
    const { DB: db } = await fixture.getEnv();
    const provider = { fetch };
    await testUpstreamImports({
      server: provider,
      db,
      signIn: (id) => signIn(id, db, provider, "http://localhost"),
    });
  });

  await t.test("moderation", () => testModeration({ server, db: DB, signIn }));
  await t.test("tutorial progress belongs to the signed-in member", async () => {
    assert.equal((await server.fetch("/api/pages/tutorial")).status, 401);
    const signedOut = await server.fetch("/api/actions/saveProductTourStatus", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ args: ["journal", 7, "completed"] }),
    });
    assert.equal(signedOut.status, 200);
    assert.deepEqual(await signedOut.json(), {
      ok: false,
      error: "Your session has expired — sign in again to continue.",
    });
    const cookie = await signIn("tutorial-owner");
    const saved = await server.fetch("/api/actions/saveProductTourStatus", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ args: ["journal", 7, "completed"] }),
    });
    assert.deepEqual(await saved.json(), { ok: true });
    const result = await server.fetch("/api/pages/tutorial", { headers: { cookie } });
    assert.equal(result.status, 200);
    assert.match(result.headers.get("cache-control") ?? "", /private.*no-store/);
    assert.deepEqual((await apiJson(result, "/api/pages/tutorial")).progress, [
      { tourId: "journal", version: 7, status: "completed" },
    ]);
    const other = await signIn("tutorial-other");
    assert.deepEqual(
      (
        await apiJson(
          server.fetch("/api/pages/tutorial", { headers: { cookie: other } }),
          "/api/pages/tutorial",
        )
      ).progress,
      [],
    );
  });
  await t.test("climb lists", () => testLists({ server, db: DB, signIn }));
  await t.test("goal refresh", () => testGoalRefresh({ server, db: DB, signIn }));
  await t.test("send alerts", () => testSendAlerts({ server, db: DB, signIn }));
  await t.test("public search HTML and bootstrap", () =>
    testPublicSearch({ server, db: DB, signIn }),
  );
  await t.test("projects", () => testProjects({ server, db: DB, signIn }));
  await t.test("trips", () => testTrips({ server, db: DB, signIn }));
});
