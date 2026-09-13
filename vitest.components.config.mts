import { defineProject } from "vitest/config";

export default defineProject({
  resolve: { alias: { "@": import.meta.dirname } },
  test: {
    name: "components",
    environment: "jsdom",
    include: ["components/**/*.dom.test.{ts,tsx}", "hooks/**/*.dom.test.{ts,tsx}"],
    setupFiles: ["./test/setup-dom.ts"],
    clearMocks: true,
    restoreMocks: true,
  },
});
