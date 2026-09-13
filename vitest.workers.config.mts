import path from "node:path";

import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineProject } from "vitest/config";

export default defineProject({
  resolve: {
    alias: {
      "@": import.meta.dirname,
    },
  },
  plugins: [
    cloudflareTest(async () => {
      const migrationsPath = path.join(import.meta.dirname, "drizzle/migrations");
      const migrations = await readD1Migrations(migrationsPath);

      return {
        // Tests import query/mutation modules directly; they do not need the
        // deployed OpenNext entrypoint to have been built first.
        main: "./test/worker.ts",
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: { TEST_MIGRATIONS: migrations },
        },
      };
    }),
  ],
  test: {
    name: "workers",
    include: [
      "actions/**/*.test.{ts,tsx}",
      "app/**/*.test.{ts,tsx}",
      "components/**/*.test.{ts,tsx}",
      "db/**/*.test.{ts,tsx}",
      "lib/**/*.test.{ts,tsx}",
      // Pure helpers only — a script's own I/O uses node builtins the Workers
      // pool doesn't provide.
      "scripts/**/*.test.{ts,tsx}",
    ],
    exclude: [".claude/**", "node_modules/**", "**/*.dom.test.{ts,tsx}"],
    setupFiles: ["./test/apply-migrations.ts"],
  },
});
