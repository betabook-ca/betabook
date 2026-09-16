import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, vi } from "vitest";

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
