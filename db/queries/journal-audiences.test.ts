import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it } from "vitest";

import { createDb } from "@/db/client";
import { friendships, user } from "@/db/schema";
import { DEFAULT_JOURNAL_FILTER } from "@/lib/filters/journal-filter";
import type { SharingAudience } from "@/lib/privacy";
import {
  seedFixtureUser,
  seedFixtureFriendship,
  seedFixtureTree,
  seedFixtureSend,
  seedFixtureJournalEntry,
  seedFixturePinnedProject,
} from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

import { canReadJournal } from "./content-access";
import { getFeedPage } from "./feed";
import {
  getJournalPage,
  getJournalSessionsForAnalytics,
  getPinnedProjects,
  hasJournalEntries,
} from "./journal";

const db = createDb(env.DB);
beforeEach(async () => {
  await resetDb(db);
  await seedFixtureTree(db);
  for (const id of ["author", "outgoing", "incoming", "connected", "stranger"])
    await seedFixtureUser(db, { id });
  await seedFixtureFriendship(db, "outgoing", "author", "pending");
  await seedFixtureFriendship(db, "author", "incoming", "pending");
  await seedFixtureFriendship(db, "connected", "author");
  await seedFixtureSend(db, {
    userId: "author",
    climbId: 1,
    dateSent: "2026-09-01",
    comment: "Restricted ascent note",
  });
  await seedFixtureJournalEntry(db, {
    userId: "author",
    climbId: 1,
    entryDate: "2026-09-01",
    sent: true,
    isAscent: true,
    body: "Restricted ascent note",
  });
  await seedFixtureJournalEntry(db, {
    userId: "author",
    climbId: 2,
    entryDate: "2026-09-01",
    body: "Restricted project session",
    tags: ["secret-tag"],
  });
  await seedFixtureJournalEntry(db, {
    userId: "author",
    kind: "training",
    entryDate: "2026-09-01",
    body: "Restricted training",
  });
  // Projects are pin-driven now, so the climb has to be pinned before this
  // read has anything to gate.
  await seedFixturePinnedProject(db, { userId: "author", climbId: 2 });
});

it.each<SharingAudience>(["private", "public", "friends"])(
  "enforces %s journal access for authorization, counts, analytics and projects",
  async (journalVisibility) => {
    await db.update(user).set({ journalVisibility }).where(eq(user.id, "author"));
    const ownerId = "author";
    for (const viewer of ["connected", "outgoing", "incoming", "stranger", null, "author"]) {
      const isFriend = viewer === "connected";
      const canRead =
        viewer === "author" ||
        (viewer !== null && journalVisibility === "public") ||
        (journalVisibility === "friends" && isFriend);
      expect(await canReadJournal(db, ownerId, viewer)).toBe(canRead);
      expect(await hasJournalEntries(db, ownerId, viewer)).toBe(canRead);
      expect(await getJournalSessionsForAnalytics(db, ownerId, viewer)).toEqual(
        canRead ? [{ entryDate: "2026-09-01", climbType: "boulder", count: 2 }] : [],
      );
      expect(
        (await getPinnedProjects(db, ownerId, viewer, { sent: false })).map(
          (project) => project.climbId,
        ),
      ).toEqual(viewer === "author" ? [2] : []);
    }
  },
);

it("checks current DB privacy and friendships after audience changes and removal", async () => {
  const ownerId = "author";
  await db.update(user).set({ journalVisibility: "friends" }).where(eq(user.id, "author"));
  expect((await getJournalPage(db, ownerId, "outgoing", DEFAULT_JOURNAL_FILTER)).entries).toEqual(
    [],
  );
  expect(
    (await getJournalPage(db, ownerId, "connected", DEFAULT_JOURNAL_FILTER)).entries,
  ).toHaveLength(3);
  await db.delete(friendships).where(eq(friendships.requestedBy, "connected"));
  expect((await getJournalPage(db, ownerId, "connected", DEFAULT_JOURNAL_FILTER)).entries).toEqual(
    [],
  );
  expect((await getFeedPage(db, "connected")).days).toEqual([]);
  await seedFixtureFriendship(db, "connected", "author");
  await db.update(user).set({ isPrivate: true }).where(eq(user.id, "author"));
  expect((await getJournalPage(db, ownerId, "connected", DEFAULT_JOURNAL_FILTER)).entries).toEqual(
    [],
  );
  expect(await hasJournalEntries(db, ownerId, "connected")).toBe(false);
  expect((await getFeedPage(db, "connected")).days).toEqual([]);
  expect(
    (await getJournalPage(db, ownerId, "author", DEFAULT_JOURNAL_FILTER)).entries,
  ).toHaveLength(3);
});

it("shares journal activity in both directions and ends both feeds and journal access on removal", async () => {
  await db.update(user).set({ journalVisibility: "friends" });
  await seedFixtureJournalEntry(db, {
    userId: "connected",
    kind: "training",
    entryDate: "2026-09-02",
    body: "Partner training",
  });
  const authorId = "author";
  const partnerId = "connected";
  expect(
    (await getJournalPage(db, partnerId, "author", DEFAULT_JOURNAL_FILTER)).entries.map(
      (row) => row.body,
    ),
  ).toEqual(["Partner training"]);
  expect(
    (await getJournalPage(db, authorId, "connected", DEFAULT_JOURNAL_FILTER)).entries,
  ).toHaveLength(3);
  expect((await getFeedPage(db, "author")).days.map((day) => day.userId)).toEqual(["connected"]);
  expect((await getFeedPage(db, "connected")).days.map((day) => day.userId)).toEqual(["author"]);
  await db.delete(friendships).where(eq(friendships.requestedBy, "connected"));
  for (const [ownerId, viewer] of [
    [authorId, "connected"],
    [partnerId, "author"],
  ] as const) {
    expect((await getJournalPage(db, ownerId, viewer, DEFAULT_JOURNAL_FILTER)).entries).toEqual([]);
    expect((await getFeedPage(db, viewer)).days).toEqual([]);
  }
});
