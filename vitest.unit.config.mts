import { defineProject } from "vitest/config";

import { testAliases } from "./vitest.aliases.mts";

export default defineProject({
  resolve: { alias: testAliases },
  test: {
    name: "unit",
    environment: "node",
    include: ["frontend/src/**/*.test.{ts,tsx}"],
    exclude: ["**/*.dom.test.{ts,tsx}"],
    setupFiles: ["./test/setup-router-link.ts"],
  },
});
