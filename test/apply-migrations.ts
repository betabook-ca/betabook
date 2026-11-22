import { env } from "cloudflare:test";
import { vi } from "vitest";

// Apply all D1 migrations lazily in a single batch on the first DB call so
// pure unit/SSR tests in the workers project pay zero migration cost and
// DB-backed tests avoid 50+ sequential IPC round-trips per file. Each file
// still gets its own isolated D1 database (`isolate: true`).
const rawPrepare = env.DB.prepare.bind(env.DB);
const rawBatch = env.DB.batch.bind(env.DB);
const rawExec = env.DB.exec.bind(env.DB);
const rawDump = env.DB.dump.bind(env.DB);

let migrationPromise: Promise<void> | undefined;
const ensureReady = (): Promise<void> => {
  migrationPromise ??= rawBatch(
    env.TEST_MIGRATIONS.flatMap((m) => m.queries.map((query) => rawPrepare(query))),
  ).then(() => undefined);
  return migrationPromise;
};

const stmtProto = Object.getPrototypeOf(rawPrepare("SELECT 1")) as D1PreparedStatement;
for (const method of ["first", "run", "all", "raw"] as const) {
  const original = stmtProto[method] as (...args: unknown[]) => Promise<unknown>;
  stmtProto[method] = async function (this: D1PreparedStatement, ...args: unknown[]) {
    await ensureReady();
    return original.apply(this, args);
  } as never;
}

env.DB.batch = async <T = unknown>(statements: D1PreparedStatement[]) => {
  await ensureReady();
  return rawBatch<T>(statements);
};
env.DB.exec = async (query: string) => {
  await ensureReady();
  return rawExec(query);
};
env.DB.dump = async () => {
  await ensureReady();
  return rawDump();
};

// Action integration tests complete the post-response phase before assertions.
// The scheduling contract itself is covered using the real helper in goal-refresh.test.ts.
vi.mock("@/actions/goal-refresh", () => ({
  scheduleGoalRefresh: async (db: import("@/db/client").Database, ownerId: string) => {
    const { refreshGoalsAfterWrite } = await import("@/db/queries/goals");
    await refreshGoalsAfterWrite(db, ownerId);
  },
}));
