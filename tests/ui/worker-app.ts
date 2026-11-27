import type { APIRequestContext } from "@playwright/test";

// oxlint-disable-next-line import/no-relative-parent-imports -- use the credential format shared by the local seed scripts.
import { hashSeedPassword } from "../../scripts/seed-password";
import { expect, test as base } from "./story";

export type WorkerApp = { url: URL; db: CloudflareEnv["DB"] };

export async function signInMember(request: APIRequestContext, { url, db }: WorkerApp, id: string) {
  const email = id + "@example.test";
  const password = "browser-fixture-password";
  const terms = await request.get(new URL("/api/terms/status", url).href);
  await expect(terms).toBeOK();
  const { version } = await terms.json();
  await db.batch([
    db
      .prepare(
        "INSERT INTO user(id,name,email,email_verified,terms_version,terms_accepted_at) VALUES (?,?,?,1,?,1)",
      )
      .bind(id, id, email, version),
    db
      .prepare(
        "INSERT INTO account(id,account_id,provider_id,user_id,password,updated_at) VALUES (?,?,'credential',?,?,1)",
      )
      .bind(id, id, id, await hashSeedPassword(password)),
  ]);
  const login = await request.post(new URL("/api/auth/sign-in/email", url).href, {
    headers: { origin: url.origin },
    data: { email, password },
  });
  await expect(login).toBeOK();
}

export const test = base.extend<{ workerApp: WorkerApp }>({
  // oxlint-disable-next-line no-empty-pattern -- Playwright requires destructuring for a fixture with no dependencies.
  workerApp: async ({}, provide) => {
    const { createTestHarness } = await import("wrangler");
    const harness = createTestHarness({
      workers: [
        {
          // Reuse the release JS/WASM and assets while the primary preview serves them.
          configPath: "./wrangler.jsonc",
          prebuiltWorkerDir: "./backend/worker/build",
          vars: { BETTER_AUTH_URL: "http://localhost" },
          secrets: {
            BETTER_AUTH_SECRET: "local-browser-fixture-secret-long-enough",
            TURNSTILE_SECRET_KEY: "",
          },
        },
      ],
    });
    try {
      const { url } = await harness.listen();
      const worker = harness.getWorker<Pick<CloudflareEnv, "DB">>();
      await worker.applyD1Migrations("DB");
      const { DB } = await worker.getEnv();
      await provide({ url, db: DB });
    } finally {
      await harness.close();
    }
  },
});
