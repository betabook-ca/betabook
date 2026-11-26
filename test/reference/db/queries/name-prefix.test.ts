import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { beforeEach, expect, it } from "vitest";

import * as schema from "@/db/schema";
import { seedFixtureUser } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

import { getClimbersPage } from "./friendships";
import { getTakenNamesAround } from "./users";

const queries: { query: string; params: unknown[] }[] = [];
const db = drizzle(env.DB, {
  schema,
  logger: { logQuery: (query, params) => queries.push({ query, params }) },
});

beforeEach(async () => {
  await resetDb(db);
  queries.length = 0;
});

it.each(["A".repeat(55), "é".repeat(30), "A_%\\".repeat(15)])(
  "matches the entire literal name prefix while respecting D1's pattern-byte limit: %s",
  async (prefix) => {
    const expected = [`${prefix} 2`, `${prefix} 3`];
    for (const [index, name] of [...expected, `${prefix.slice(0, -1)}X 2`].entries()) {
      await seedFixtureUser(db, { id: `name-${index}`, name });
    }

    const page = await getClimbersPage(db, "viewer", { name: prefix });
    expect(page.climbers.map((climber) => climber.name)).toEqual(expected);
    expect(await getTakenNamesAround(db, prefix, prefix)).toEqual(
      new Set(expected.map((name) => name.toLowerCase())),
    );

    // Local D1 does not impose production's 50-byte LIKE/GLOB limit.
    // Check the actual bound patterns while keeping query execution real.
    const patterns = queries.flatMap(({ query, params }) =>
      [...query.matchAll(/\bLIKE\s+\?/gi)].map((match) => {
        const parameter = query.slice(0, match.index).match(/\?/g)?.length ?? 0;
        return params[parameter] as string;
      }),
    );
    expect(patterns).toHaveLength(2);
    for (const pattern of patterns)
      expect(new TextEncoder().encode(pattern).byteLength).toBeLessThanOrEqual(50);
  },
);
