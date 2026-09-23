import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDb, type Database } from "@/db/client";
import {
  getJournalForClimb,
  getJournalPage,
  getJournalSessionsForAnalytics,
  getOpenProjectSuggestions,
  getPinnedProjects,
  getPinnedProjectSessions,
  hasJournalEntries,
} from "@/db/queries";
import { user } from "@/db/schema";
import { DEFAULT_JOURNAL_FILTER } from "@/lib/filters/journal-filter";
import {
  seedFixtureJournalEntry,
  seedFixturePinnedProject,
  seedFixtureTree,
  seedFixtureUser,
} from "@/test/fixtures";

let db: Database;

const OWNER_ID = "priv-owner";
const CLIMB = 1; // Test Highball, from seedFixtureTree

beforeAll(async () => {
  db = createDb(env.DB);
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: OWNER_ID, name: "Private Owner" });
  await seedFixtureJournalEntry(db, {
    userId: OWNER_ID,
    climbId: CLIMB,
    entryDate: "2026-02-01",
    body: "Nobody else's business.",
  });
  await seedFixturePinnedProject(db, { userId: OWNER_ID, climbId: CLIMB, pinnedAt: "2026-01-20" });
});

beforeEach(async () => {
  await db
    .update(user)
    .set({ isPrivate: false, journalVisibility: "private" })
    .where(eq(user.id, OWNER_ID));
});

const expectedEntry = {
  id: 1,
  climbId: CLIMB,
  kind: "session",
  sent: false,
  isAscent: false,
  isSendComment: false,
  entryDate: "2026-02-01",
  body: "Nobody else's business.",
  companions: [],
  tags: [],
  climbName: "Test Highball",
  climbType: "boulder",
  climbGrade: 5,
  climbBrokenOn: null,
  reportedGrade: null,
  areaId: 4,
  areaName: "Test Highball Alcove",
};

const GATED_READS = [
  {
    name: "getJournalPage",
    read: (ownerId: string, viewerId: string | null) =>
      getJournalPage(db, ownerId, viewerId, DEFAULT_JOURNAL_FILTER),
    visible: { entries: [expectedEntry], hasMore: false, nextCursor: null },
    empty: { entries: [], hasMore: false, nextCursor: null },
  },
  {
    name: "getJournalForClimb",
    read: (ownerId: string, viewerId: string | null) =>
      getJournalForClimb(db, ownerId, viewerId, CLIMB),
    visible: [expectedEntry],
    empty: [],
  },
  {
    name: "getPinnedProjects",
    read: (ownerId: string, viewerId: string | null) =>
      getPinnedProjects(db, ownerId, viewerId, { sent: false }),
    visible: [
      {
        climbId: CLIMB,
        climbName: "Test Highball",
        climbType: "boulder",
        climbGrade: 5,
        climbBrokenOn: null,
        areaId: 4,
        areaName: "Test Highball Alcove",
        sessionCount: 1,
        noteCount: 1,
        pinnedAt: "2026-01-20",
        firstSession: "2026-02-01",
        lastSession: "2026-02-01",
        sentOn: null,
        sent: false,
        share: null,
      },
    ],
    empty: [],
  },
  {
    name: "getPinnedProjectSessions",
    read: (ownerId: string, viewerId: string | null) =>
      getPinnedProjectSessions(db, ownerId, viewerId, [CLIMB]),
    visible: [expectedEntry],
    empty: [],
  },
  {
    name: "getJournalSessionsForAnalytics",
    read: (ownerId: string, viewerId: string | null) =>
      getJournalSessionsForAnalytics(db, ownerId, viewerId),
    visible: [{ entryDate: "2026-02-01", climbType: "boulder", count: 1 }],
    empty: [],
  },
  {
    name: "hasJournalEntries",
    read: (ownerId: string, viewerId: string | null) => hasJournalEntries(db, ownerId, viewerId),
    visible: true,
    empty: false,
  },
] as const;

describe.each(GATED_READS)("$name", ({ name, read, empty, visible }) => {
  it("returns nothing to a signed-out visitor while the journal is private", async () => {
    expect(await read(OWNER_ID, null)).toEqual(empty);
  });

  it("returns nothing to another climber while the journal is private", async () => {
    expect(await read(OWNER_ID, "someone-else")).toEqual(empty);
  });

  it("returns nothing to another climber when the whole profile is private", async () => {
    await db
      .update(user)
      .set({ isPrivate: true, journalVisibility: "public" })
      .where(eq(user.id, OWNER_ID));
    expect(await read(OWNER_ID, "someone-else")).toEqual(empty);
  });

  it("returns the journal to its owner", async () => {
    expect(await read(OWNER_ID, OWNER_ID)).toEqual(visible);
  });

  it("shares journals with members while keeping anonymous access and Projects restricted", async () => {
    await db.update(user).set({ journalVisibility: "public" }).where(eq(user.id, OWNER_ID));
    expect(await read(OWNER_ID, null)).toEqual(empty);
    expect(await read(OWNER_ID, "someone-else")).toEqual(
      name.startsWith("getPinned") ? empty : visible,
    );
  });
});

/** Kept out of GATED_READS because it needs the opposite fixture: a climb that
 * is *not* pinned, where every other project read needs one that is. */
describe("getOpenProjectSuggestions", () => {
  const SUGGESTION_OWNER = "priv-suggestion-owner";
  const UNPINNED_CLIMB = 2; // Test Slab, from seedFixtureTree

  // Seeded once, like the rest of this file: nothing here mutates it, and the
  // outer beforeEach only resets the shared owner's visibility.
  beforeAll(async () => {
    await seedFixtureUser(db, { id: SUGGESTION_OWNER, name: "Suggestion Owner" });
    await seedFixtureJournalEntry(db, {
      userId: SUGGESTION_OWNER,
      climbId: UNPINNED_CLIMB,
      entryDate: "2026-02-03",
      body: "Worked, never sent, never pinned.",
    });
    await db
      .update(user)
      .set({ isPrivate: false, journalVisibility: "public" })
      .where(eq(user.id, SUGGESTION_OWNER));
  });

  it("offers the owner a climb they have worked but not sent or pinned", async () => {
    const suggestions = await getOpenProjectSuggestions(db, SUGGESTION_OWNER, SUGGESTION_OWNER);
    expect(suggestions.map(({ climbId }) => climbId)).toEqual([UNPINNED_CLIMB]);
    expect(suggestions[0]).toMatchObject({ climbName: "Test Slab", sessionCount: 1 });
  });

  it("offers nothing to anyone else, even with the journal shared with members", async () => {
    expect(await getOpenProjectSuggestions(db, SUGGESTION_OWNER, "someone-else")).toEqual([]);
    expect(await getOpenProjectSuggestions(db, SUGGESTION_OWNER, null)).toEqual([]);
  });
});
