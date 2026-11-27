import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["./vitest.unit.config.mts", "./vitest.components.config.mts"],
  },
});
