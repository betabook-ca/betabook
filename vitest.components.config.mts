import { defineProject } from "vitest/config";

export default defineProject({
  resolve: {
    alias: {
      "@": import.meta.dirname,
      // A workerd builtin; see test/cloudflare-workers-stub.ts.
      "cloudflare:workers": `${import.meta.dirname}/test/cloudflare-workers-stub.ts`,
    },
  },
  test: {
    name: "components",
    environment: "jsdom",
    include: ["components/**/*.dom.test.{ts,tsx}", "hooks/**/*.dom.test.{ts,tsx}"],
    setupFiles: ["./test/setup-dom.ts", "./test/setup-next-link.ts"],
    clearMocks: true,
    restoreMocks: true,
  },
});
