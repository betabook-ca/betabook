import { AsyncLocalStorage } from "node:async_hooks";

import { env } from "cloudflare:test";
import { afterAll, vi } from "vitest";

// workerd intentionally throws from `AsyncLocalStorage#disable()`
// (cloudflare/workerd#208), which Vitest 5.1's mocker calls once no `vi.mock`
// factory is pending (vitest-dev/vitest#11623, vitest-dev/vitest#11907). Match
// @cloudflare/vitest-plugin's fix (cloudflare/workers-sdk#16699, queued for
// 1.6.1): skip `disable()` when no store is active and keep workerd's throw
// inside an active `run()`.
const PATCHED_ALS = Symbol.for("betabook.patchedAlsDisable");
const PATCHED_DB = Symbol.for("betabook.patchedD1LazyMigrations");

interface D1WorkerState {
  ensureReady: () => Promise<void>;
  resetAfterFile: () => Promise<void>;
}

const globalState = globalThis as typeof globalThis & {
  [PATCHED_ALS]?: boolean;
  [PATCHED_DB]?: WeakMap<D1Database, D1WorkerState>;
};

if (!globalState[PATCHED_ALS]) {
  globalState[PATCHED_ALS] = true;
  const originalDisable = AsyncLocalStorage.prototype.disable;
  AsyncLocalStorage.prototype.disable = function disable(this: AsyncLocalStorage<unknown>) {
    if (this.getStore() !== undefined) {
      originalDisable.call(this);
    }
  };
}

// Apply all D1 migrations lazily in a single batch on the first query so pure
// unit/SSR tests in the workers project pay zero migration cost and DB-backed
// tests avoid 58 per-file migration round-trips.
const dbStates = (globalState[PATCHED_DB] ??= new WeakMap<D1Database, D1WorkerState>());

let dbState = dbStates.get(env.DB);
if (!dbState) {
  const rawPrepare = env.DB.prepare.bind(env.DB);
  const rawBatch = env.DB.batch.bind(env.DB);
  const rawExec = env.DB.exec.bind(env.DB);
  const rawDump = env.DB.dump.bind(env.DB);

  let migrationPromise: Promise<void> | undefined;
  let dirty = false;

  const ensureReady = (): Promise<void> => {
    dirty = true;
    migrationPromise ??= rawBatch(
      env.TEST_MIGRATIONS.flatMap((m) => m.queries.map((query) => rawPrepare(query))),
    ).then(() => undefined);
    return migrationPromise;
  };

  const resetStatements = [
    "DELETE FROM change_requests",
    "DELETE FROM trips",
    "DELETE FROM journal_entries",
    "DELETE FROM sends",
    "DELETE FROM user",
    "DELETE FROM climbs",
    "UPDATE areas SET parent_id = NULL",
    "DELETE FROM areas",
    "DELETE FROM verification",
    "DELETE FROM sqlite_sequence",
  ];

  const resetAfterFile = async (): Promise<void> => {
    if (!dirty || !migrationPromise) return;
    dirty = false;
    await migrationPromise;
    await rawBatch(resetStatements.map((sql) => rawPrepare(sql)));
  };

  dbState = { ensureReady, resetAfterFile };
  dbStates.set(env.DB, dbState);

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
}

interface VitestEvaluatedModules {
  idToModuleMap: Map<
    string,
    { promise: unknown; exports: unknown; evaluated: boolean; importers: Set<unknown> }
  >;
}

const currentDbState = dbState;
afterAll(async () => {
  await currentDbState.resetAfterFile();
  const workerState = Reflect.get(globalThis, "__vitest_worker__") as
    | { evaluatedModules?: VitestEvaluatedModules }
    | undefined;
  if (!workerState?.evaluatedModules) return;
  for (const [id, node] of workerState.evaluatedModules.idToModuleMap) {
    if (
      !id.includes("/node_modules/") ||
      id.includes("/node_modules/next/") ||
      id.includes("/node_modules/resend/") ||
      id.startsWith("mock:")
    ) {
      node.promise = undefined;
      node.exports = undefined;
      node.evaluated = false;
      node.importers.clear();
    }
  }
});

// Action integration tests complete the post-response phase before assertions.
// The scheduling contract itself is covered using the real helper in goal-refresh.test.ts.
vi.mock("@/actions/goal-refresh", () => ({
  scheduleGoalRefresh: async (db: import("@/db/client").Database, ownerId: string) => {
    const { refreshGoalsAfterWrite } = await import("@/db/queries/goals");
    await refreshGoalsAfterWrite(db, ownerId);
  },
}));
