import { defineProject } from "vitest/config";

import { frontendAliases } from "./frontend/paths.ts";
import { referenceAliases } from "./test/reference/aliases.ts";

export default defineProject({
  resolve: {
    alias: [
      ...referenceAliases,
      ...frontendAliases,
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
      "frontend/src/components/**/*.dom.test.{ts,tsx}",
      "frontend/src/hooks/**/*.dom.test.{ts,tsx}",
      "frontend/src/spa/**/*.dom.test.{ts,tsx}",
    ],
    setupFiles: ["./test/setup-dom.ts", "./test/setup-router-link.ts"],
    clearMocks: true,
    restoreMocks: true,
  },
});
