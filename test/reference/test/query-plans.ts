import { sql } from "drizzle-orm";
import { expect, vi } from "vitest";

import type { Database } from "@/db/client";

/** Execute the real read, then explain its captured SQL with its original bindings. */
export async function explainQueries(db: Database, read: () => Promise<unknown>) {
  const spy = vi.spyOn(db, "all");
  let queries: Parameters<Database["all"]>[0][];
  try {
    await read();
    queries = spy.mock.calls.map(([query]) => query);
  } finally {
    spy.mockRestore();
  }
  expect(queries.length).toBeGreaterThan(0);
  const plans = [];
  for (const query of queries) {
    plans.push(await db.all<{ detail: string }>(sql`EXPLAIN QUERY PLAN ${query}`));
  }
  return plans;
}
