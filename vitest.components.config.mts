import { defineProject } from "vitest/config";

import { referenceAliases } from "./test/reference/aliases.ts";

export default defineProject({
  resolve: {
    alias: [
      ...referenceAliases,
      { find: "@", replacement: import.meta.dirname },
      // A workerd builtin; see test/cloudflare-workers-stub.ts.
      {
        find: "cloudflare:workers",
        replacement: `${import.meta.dirname}/test/cloudflare-workers-stub.ts`,
      },
    ],
  },
  test: {
    name: "components",
    environment: "jsdom",
    include: [
      "components/**/*.dom.test.{ts,tsx}",
      "hooks/**/*.dom.test.{ts,tsx}",
      "spa/**/*.dom.test.{ts,tsx}",
    ],
    setupFiles: ["./test/setup-dom.ts", "./test/setup-router-link.ts"],
    clearMocks: true,
    restoreMocks: true,
  },
});
