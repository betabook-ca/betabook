import path from "node:path";

import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineProject } from "vitest/config";

const migrationsPromise = readD1Migrations(path.join(import.meta.dirname, "drizzle/migrations"));

import { referenceAliases } from "./test/reference/aliases.ts";

export default defineProject({
  resolve: {
    alias: [...referenceAliases, { find: "@", replacement: import.meta.dirname }],
  },
  plugins: [
    cloudflareTest(async () => {
      const migrations = await migrationsPromise;

      return {
        // The reference fixtures run independently of the production Worker’s build and assets.
        main: "./test/worker.ts",
        wrangler: { configPath: "./test/reference/wrangler.jsonc" },
        miniflare: {
          bindings: { TEST_MIGRATIONS: migrations },
        },
      };
    }),
  ],
  test: {
    name: "workers",
    include: [
      "test/reference/actions/**/*.test.{ts,tsx}",
      "test/reference/app/**/*.test.{ts,tsx}",
      "components/**/*.test.{ts,tsx}",
      "test/reference/db/**/*.test.{ts,tsx}",
      "lib/**/*.test.{ts,tsx}",
      "test/reference/lib/**/*.test.{ts,tsx}",
    ],
    exclude: [".claude/**", "node_modules/**", "**/*.dom.test.{ts,tsx}"],
    setupFiles: ["./test/apply-migrations.ts", "./test/setup-router-link.ts"],
  },
});
