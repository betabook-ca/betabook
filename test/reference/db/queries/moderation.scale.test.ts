import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { beforeEach, expect, it } from "vitest";

import { createDb } from "@/db/client";
import { getAreasByIds, getUsersByIds } from "@/db/queries";
import * as schema from "@/db/schema";
import { adminAreaScopes, changeRequests } from "@/db/schema";
import { getReviewQueueDetails } from "@/lib/moderation";
import { seedFixtureTree, seedFixtureUser, seedManyAreas } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

const db = createDb(env.DB);
beforeEach(async () => {
  await resetDb(db);
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: "reviewer", role: "admin" });
  await db.insert(adminAreaScopes).values({ userId: "reviewer", areaId: 2 });
});

it("loads 101 requester names and areas without exceeding the binding limit", async () => {
  const ids = Array.from({ length: 101 }, (_, i) => `requester-${i}`);
  for (const id of ids) await seedFixtureUser(db, { id, name: id });
  await seedManyAreas(db, 101, 100);
  const users = await getUsersByIds(db, ids);
  expect(users.map((row) => row.name).sort()).toEqual([...ids].sort());
  const areas = await getAreasByIds(
    db,
    Array.from({ length: 101 }, (_, i) => 100 + i),
  );
  expect(areas.map((area) => area.id).sort((a, b) => a - b)).toEqual(
    Array.from({ length: 101 }, (_, i) => 100 + i),
  );
});

it("bounds the fully described queue after filtering unrelated requests", async () => {
  for (let i = 0; i < 56; i += 1) {
    await seedFixtureUser(db, { id: `requester-${i}` });
    await db.insert(changeRequests).values({
      id: i + 1,
      type: "climb_edit",
      entityId: i < 30 ? 3 : 1,
      payload: '{"name":"Rename"}',
      requestedBy: `requester-${i}`,
      requestedAt: new Date("2026-09-01T00:00:00Z"),
    });
  }
  let queryCount = 0;
  const measuredDb = drizzle(env.DB, {
    schema,
    logger: {
      logQuery: () => {
        queryCount += 1;
      },
    },
  });
  const rows = await getReviewQueueDetails(measuredDb, { user: { id: "reviewer", role: "admin" } });
  expect(rows.map((row) => row.request.id)).toEqual(Array.from({ length: 25 }, (_, i) => 31 + i));
  expect(rows[0].description.summary).toBe('Rename "Test Highball" to "Rename"');
  expect(rows[0].coverage.missingAreaIds).toEqual([4]);
  expect(queryCount).toBeLessThanOrEqual(6);
  const last = rows.at(-1)!.request;
  await db.delete(changeRequests).where(eq(changeRequests.id, last.id));
  const next = await getReviewQueueDetails(
    db,
    { user: { id: "reviewer", role: "admin" } },
    {
      after: { id: last.id, requestedAt: last.requestedAt.getTime() },
    },
  );
  expect(next.map((row) => row.request.id)).toEqual([56]);
});
