import { createRequire } from "node:module";
import path from "node:path";

import { defineConfig } from "vitest/config";

const nextRequire = createRequire(createRequire(import.meta.url).resolve("next/package.json"));
const swcHelpers = path.dirname(nextRequire.resolve("@swc/helpers/package.json"));

export default defineConfig({
  resolve: {
    alias: [
      // The Workers pool resolves require() through this root server, and under Vite 8 it picks
      // the ESM build of Next's @swc/helpers. https://github.com/cloudflare/workers-sdk/pull/13062
      { find: /^@swc\/helpers\/_\/(.+)$/, replacement: `${swcHelpers}/cjs/$1.cjs` },
    ],
  },
  test: {
    projects: ["./vitest.workers.config.mts", "./vitest.components.config.mts"],
  },
});
