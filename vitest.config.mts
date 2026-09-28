import { createRequire } from "node:module";
import path from "node:path";

import { defineConfig } from "vitest/config";

// Resolved through next itself: the helpers are its dependency, not ours, and
// their exports map hides the cjs/ directory from a bare specifier.
const nextRequire = createRequire(createRequire(import.meta.url).resolve("next/package.json"));
const swcHelpersDir = path.dirname(nextRequire.resolve("@swc/helpers/package.json"));

export default defineConfig({
  // Workers-pool tests render components that import the real `next/*`
  // modules, whose CommonJS build `require`s these helpers. The pool resolves
  // each `require` through this root server with a CommonJS hint that Vite 8's
  // resolver no longer reads, so it would load the ESM build and the helper
  // would come back undefined. Pin the CommonJS files instead.
  plugins: [
    {
      name: "betabook:swc-helpers-cjs",
      enforce: "pre",
      resolveId(id) {
        const helper = /^@swc\/helpers\/_\/(\w+)$/.exec(id)?.[1];
        return helper ? path.join(swcHelpersDir, "cjs", `${helper}.cjs`) : null;
      },
    },
  ],
  test: {
    projects: ["./vitest.workers.config.mts", "./vitest.components.config.mts"],
  },
});
