import { AsyncLocalStorage } from "node:async_hooks";

import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, vi } from "vitest";

// workerd intentionally throws from `AsyncLocalStorage#disable()`
// (cloudflare/workerd#208), which Vitest 5.1's mocker calls once no `vi.mock`
// factory is pending (vitest-dev/vitest#11623, vitest-dev/vitest#11907). Match
// @cloudflare/vitest-plugin's fix (cloudflare/workers-sdk#16699, queued for
// 1.6.1): skip `disable()` when no store is active and keep workerd's throw
// inside an active `run()`.
const originalDisable = AsyncLocalStorage.prototype.disable;
AsyncLocalStorage.prototype.disable = function disable(this: AsyncLocalStorage<unknown>) {
  if (this.getStore() !== undefined) {
    originalDisable.call(this);
  }
};

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

// Action integration tests complete the post-response phase before assertions.
// The scheduling contract itself is covered using the real helper in goal-refresh.test.ts.
vi.mock("@/actions/goal-refresh", () => ({
  scheduleGoalRefresh: async (db: import("@/db/client").Database, ownerId: string) => {
    const { refreshGoalsAfterWrite } = await import("@/db/queries/goals");
    await refreshGoalsAfterWrite(db, ownerId);
  },
}));
