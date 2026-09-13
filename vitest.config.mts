import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["./vitest.workers.config.mts", "./vitest.components.config.mts"],
  },
});
