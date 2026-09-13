import { eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { Database } from "@/db/client";
import { areas, climbs, user, sends, journalEntries, friendships } from "@/db/schema";
import { friendshipPair } from "@/lib/friendships";
import { TERMS_VERSION } from "@/lib/terms";

type FriendshipStatus = "pending" | "accepted";

export async function seedFixtureFriendship(
  db: Database,
  requester: string,
  recipient: string,
  status: FriendshipStatus = "accepted",
) {
  await db
    .insert(friendships)
    .values({ ...friendshipPair(requester, recipient), requestedBy: requester, status });
}

/** Scale fixtures are bound by round trips, not by the writes themselves: a
 * per-row insert loop is what leaves a test one slow runner away from its
 * timeout. D1 caps a statement at 100 bound parameters, so each caller packs
 * as many rows per insert as its table's bound columns allow and hands those
 * statements to `batch`, which costs one round trip per group rather than one
 * per row. Order is preserved, so ids stay predictable for tests that assert
 * on them. */
async function insertInBatches<Row>(
  db: Database,
  rows: Row[],
  rowsPerStatement: number,
  insert: (chunk: Row[]) => BatchItem<"sqlite">,
) {
  const statements: BatchItem<"sqlite">[] = [];
  for (let i = 0; i < rows.length; i += rowsPerStatement) {
    statements.push(insert(rows.slice(i, i + rowsPerStatement)));
  }
  const STATEMENTS_PER_BATCH = 25;
  for (let i = 0; i < statements.length; i += STATEMENTS_PER_BATCH) {
    const group = statements.slice(i, i + STATEMENTS_PER_BATCH);
    await db.batch(group as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
  }
}

/** `seedFixtureFriendship` for one requester and many recipients. */
export function seedManyFriendships(
  db: Database,
  requester: string,
  recipients: string[],
  status: FriendshipStatus = "accepted",
) {
  return insertInBatches(db, recipients, 16, (chunk) =>
    db.insert(friendships).values(
      chunk.map((recipient) => ({
        ...friendshipPair(requester, recipient),
        requestedBy: requester,
        status,
      })),
    ),
  );
}

/**
 * A small tree exercising: a root with no ancestors, a two-level-deep
 * ancestor chain, an area whose climbs live only on its descendants (not
 * itself), and a leaf area with climbs directly attached.
 *
 *   Test Crag (1)
 *   ├── Test Boulders (2)
 *   │   ├── Test Highball Alcove (4)       -> climb: Test Highball (boulder, V4)
 *   │   └── Test Slab Area (5)             -> climb: Test Slab (boulder, V1)
 *   └── Test Sport Wall (3)                -> climbs: Test Crimper (sport, 5.10a),
 *                                                     Test Crack (trad, 5.6)
 */
export async function seedFixtureTree(db: Database) {
  // parentId is the whole tree — no positions to keep consistent with it.
  await db.insert(areas).values([
    { id: 1, parentId: null, name: "Test Crag", description: "A test crag." },
    { id: 2, parentId: 1, name: "Test Boulders" },
    { id: 3, parentId: 1, name: "Test Sport Wall" },
    { id: 4, parentId: 2, name: "Test Highball Alcove" },
    { id: 5, parentId: 2, name: "Test Slab Area" },
  ]);

  await db.insert(climbs).values([
    { id: 1, areaId: 4, name: "Test Highball", type: "boulder", grade: 5 }, // V4
    { id: 2, areaId: 5, name: "Test Slab", type: "boulder", grade: 2 }, // V1
    { id: 3, areaId: 3, name: "Test Crimper", type: "sport", grade: 10 }, // 5.10a
    { id: 4, areaId: 3, name: "Test Crack", type: "trad", grade: 6 }, // 5.6
  ]);

  // areas_fts/climbs_fts are populated by the sync triggers
  // (drizzle/migrations/0015_fts_sync_triggers.sql) — seeding them by hand
  // here would double-index every row.
}

/** Inserts `count` boulder climbs into `areaId`, for pagination tests. */
export async function seedManyClimbs(db: Database, areaId: number, count: number, startId: number) {
  const area = await db.select().from(areas).where(eq(areas.id, areaId)).get();
  if (!area) throw new Error(`seedManyClimbs: no area with id ${areaId}`);

  const rows = Array.from({ length: count }, (_, i) => ({
    id: startId + i,
    areaId,
    name: `Bulk Climb ${i}`,
    type: "boulder" as const,
    grade: i % 19,
  }));
  // D1 has a bound-parameter limit per statement, so chunk the insert. 8
  // bound columns per row (id/areaId/name/type/grade/sendCount/ratingSum/
  // ratingCount — drizzle binds every column with a default explicitly
  // rather than omitting it), so 12 rows/chunk stays safely under the limit.
  const CHUNK_SIZE = 12;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    await db.insert(climbs).values(rows.slice(i, i + CHUNK_SIZE));
  }
}

/** Inserts `count` leaf areas sharing a common name prefix, root-level by
 * default. Two uses: exercising an area-name filter that matches many areas at
 * once (regression coverage: matching N areas used to bind 2 SQL parameters
 * per match, blowing past D1's per-statement bound-parameter limit — the same
 * limit `seedManyClimbs`'s chunking works around), and, with `parentId`,
 * building a subtree wide enough to reach LARGE_AREA_SUBTREE_AREAS. */
export async function seedManyAreas(
  db: Database,
  count: number,
  startId: number,
  {
    parentId = null,
    namePrefix = "Bulk Area",
  }: { parentId?: number | null; namePrefix?: string } = {},
) {
  const rows = Array.from({ length: count }, (_, i) => ({
    id: startId + i,
    parentId,
    name: `${namePrefix} ${i}`,
  }));
  const CHUNK_SIZE = 20;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    await db.insert(areas).values(rows.slice(i, i + CHUNK_SIZE));
  }
}

type FixtureUserOverrides = Partial<typeof user.$inferInsert> & { id: string };

/** The default name derives from the id because names are unique
 * (user_name_unique_idx) — a shared "Test Climber" literal would make any
 * second seeded user violate the index. */
function fixtureUserRow(overrides: FixtureUserOverrides) {
  return {
    name: `Test Climber ${overrides.id}`,
    email: `${overrides.id}@example.com`,
    // Domain/API fixtures normally represent a member who finished onboarding.
    // Terms-specific tests explicitly override these with legacy/null values.
    termsVersion: TERMS_VERSION,
    termsAcceptedAt: new Date("2026-09-09T00:00:00Z"),
    ...overrides,
  };
}

/** Inserts a minimal `user` row for send-query tests; `id` must be unique per
 * call. */
export async function seedFixtureUser(db: Database, overrides: FixtureUserOverrides) {
  const row = fixtureUserRow(overrides);
  await db.insert(user).values(row);
  return row;
}

/** `seedFixtureUser` for many users at once. */
export function seedManyUsers(db: Database, overrides: FixtureUserOverrides[]) {
  return insertInBatches(db, overrides.map(fixtureUserRow), 8, (chunk) =>
    db.insert(user).values(chunk),
  );
}

type FixtureSendOverrides = Partial<typeof sends.$inferInsert> & {
  userId: string;
  climbId: number;
  dateSent: string | null;
};

/** Inserts a `sends` row referencing an existing fixture user/climb.
 * climbs.sendCount/ratingSum/ratingCount follow via the triggers from
 * 0014_sends_aggregate_triggers, which the test pool applies along with
 * every other migration — so seeding directly here stays consistent with a
 * real write, and getSubtreeClimbs sort/rating assertions hold. */
export async function seedFixtureSend(db: Database, overrides: FixtureSendOverrides) {
  const row = {
    ascentStyle: "redpoint" as const,
    comment: null,
    rating: null,
    suggestedGrade: null,
    ...overrides,
  };
  await db.insert(sends).values(row);
  return row;
}

type FixtureJournalEntryOverrides = Partial<typeof journalEntries.$inferInsert> & {
  userId: string;
  entryDate: string;
};

export async function seedFixtureJournalEntry(
  db: Database,
  overrides: FixtureJournalEntryOverrides,
) {
  const kind = overrides.kind ?? "session";
  const row = {
    kind,
    sent: false,
    climbId: kind === "session" ? 1 : null,
    body: null,
    tags: null,
    ...overrides,
  };
  await db.insert(journalEntries).values(row);
  return row;
}

/** `seedFixtureJournalEntry` for many entries at once, taking complete rows
 * rather than filling defaults — bulk callers describe every field anyway. */
export function seedManyJournalEntries(db: Database, rows: (typeof journalEntries.$inferInsert)[]) {
  return insertInBatches(db, rows, 12, (chunk) => db.insert(journalEntries).values(chunk));
}
