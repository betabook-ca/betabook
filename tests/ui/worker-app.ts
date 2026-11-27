import { test as base } from "./story";

export type WorkerApp = { url: URL; db: CloudflareEnv["DB"] };

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
