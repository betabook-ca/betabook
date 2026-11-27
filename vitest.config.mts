import path from "node:path";

import { defineConfig } from "vitest/config";

import { frontendAliases, frontendDir } from "./frontend/paths.ts";

const testAliases = [
  { find: "@/test", replacement: path.join(import.meta.dirname, "test") },
  { find: "@/stories", replacement: path.join(frontendDir, "stories") },
  ...frontendAliases,
];

export default defineConfig({
  resolve: { alias: testAliases },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["frontend/src/**/*.test.{ts,tsx}"],
          exclude: ["**/*.dom.test.{ts,tsx}"],
          setupFiles: ["./test/setup-router-link.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "components",
          environment: "jsdom",
          include: [
            "frontend/src/components/**/*.dom.test.{ts,tsx}",
            "frontend/src/hooks/**/*.dom.test.{ts,tsx}",
            "frontend/src/spa/**/*.dom.test.{ts,tsx}",
          ],
          setupFiles: ["./test/setup-dom.ts", "./test/setup-router-link.ts"],
          clearMocks: true,
          restoreMocks: true,
        },
      },
    ],
  },
});
