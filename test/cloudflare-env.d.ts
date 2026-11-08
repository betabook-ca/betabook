/// <reference types="@cloudflare/vitest-plugin/types" />

import type { D1Migration } from "cloudflare:test";

declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}

// oxlint-disable-next-line unicorn/require-module-specifiers -- required in .d.ts to treat file as module
export {};
