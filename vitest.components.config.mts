import { defineProject } from "vitest/config";

import { testAliases } from "./vitest.aliases.mts";

export default defineProject({
  resolve: { alias: testAliases },
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
});
