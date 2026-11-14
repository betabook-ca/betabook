import path from "node:path";

import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineProject } from "vitest/config";

const migrationsPromise = readD1Migrations(path.join(import.meta.dirname, "drizzle/migrations"));

export default defineProject({
  resolve: {
    alias: {
      "@": import.meta.dirname,
    },
  },
  plugins: [
    cloudflareTest(async () => {
      const migrations = await migrationsPromise;

      return {
        // Tests import query/mutation modules directly; they do not need the
        // deployed worker.ts, whose vinext handler exists only in a Vite build.
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
    isolate: false,
    include: [
      "actions/**/*.test.{ts,tsx}",
      "app/**/*.test.{ts,tsx}",
      "components/**/*.test.{ts,tsx}",
      "db/**/*.test.{ts,tsx}",
      "lib/**/*.test.{ts,tsx}",
    ],
    exclude: [".claude/**", "node_modules/**", "**/*.dom.test.{ts,tsx}"],
    setupFiles: ["./test/apply-migrations.ts", "./test/setup-next-link.ts"],
  },
});
